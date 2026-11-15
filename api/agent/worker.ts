import path from "node:path";
import { withDefaultModel } from "../ai/models";
import {
  claimNextTask,
  createReview,
  createStage,
  findTask,
  finishStage,
  updateTask,
} from "../queries/tasks";
import type { AgentTask } from "@db/schema";
import { cloneRepository, commitAndPush, createPullRequest, getRepositoryDiff } from "./git";
import { runExecutor, runFinalReview, runReviewer } from "./llm";
import { removeWorkspace } from "./workspace";
import { runChecks } from "./sandbox";

class CancelledError extends Error {}

const state = {
  workerRunning: false,
  processing: false,
  currentTaskId: null as number | null,
  lastPollAt: null as Date | null,
  lastError: null as string | null,
};

export function getWorkerState() {
  return {
    enabled: process.env.WORKER_ENABLED !== "false",
    running: state.workerRunning,
    processing: state.processing,
    currentTaskId: state.currentTaskId,
    lastPollAt: state.lastPollAt,
    lastError: state.lastError,
  };
}

async function ensureActive(taskId: number) {
  const current = await findTask(taskId);
  if (!current || current.status === "cancelled") throw new CancelledError();
}

function textError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function reviewFeedback(verdict: string, summary: string, issues: string[]) {
  return [`Вердикт: ${verdict}`, summary, ...issues.map((issue) => `- ${issue}`)].join("\n");
}

async function processTask(task: AgentTask) {
  const workspace = path.join(process.env.WORKSPACE_ROOT || "/tmp/cascade-agent", `task-${task.id}`);
  const branchName = `cascade/task-${task.id}`;
  let totalTokens = task.totalTokens;
  let feedback = "";
  let latestChecks = "Проверки ещё не выполнялись";
  let latestDiff = "";
  let executorSummary = "";
  let dependencySetupComplete = false;

  const addTokens = async (amount: number) => {
    totalTokens += amount;
    await updateTask(task.id, { totalTokens });
  };

  try {
    const cloneStage = await createStage({ taskId: task.id, kind: "clone", attempt: task.attempt + 1 });
    try {
      const cloneLogs = await cloneRepository({
        repoUrl: task.repoUrl,
        baseBranch: task.baseBranch,
        branchName,
        workspace,
      });
      await finishStage(cloneStage.id, { status: "passed", logs: cloneLogs, summary: branchName });
      await updateTask(task.id, { branchName, prUrl: null, completedAt: null });
    } catch (error) {
      await finishStage(cloneStage.id, { status: "failed", logs: textError(error) });
      throw error;
    }

    for (let attempt = task.attempt + 1; attempt <= task.maxAttempts; attempt += 1) {
      await ensureActive(task.id);
      await updateTask(task.id, { status: "executing", attempt, error: null });
      const executeStage = await createStage({ taskId: task.id, kind: "execute", attempt });
      try {
        const modelReference = await withDefaultModel(task.executorModel, "executor");
        const execution = await runExecutor({
          task,
          workspace,
          modelReference,
          feedback: feedback || undefined,
        });
        executorSummary = execution.summary;
        await addTokens(execution.tokens);
        await finishStage(executeStage.id, {
          status: "passed",
          summary: execution.summary,
          logs: execution.toolEvents.join("\n"),
        });
      } catch (error) {
        await finishStage(executeStage.id, { status: "failed", logs: textError(error) });
        throw error;
      }

      await ensureActive(task.id);
      await updateTask(task.id, { status: "checking" });
      const checkStage = await createStage({ taskId: task.id, kind: "checks", attempt });
      const repositoryDiff = await getRepositoryDiff(workspace);
      latestDiff = repositoryDiff.diff;
      if (!repositoryDiff.status) {
        latestChecks = "Исполнитель не внёс изменения в репозиторий";
        await finishStage(checkStage.id, {
          status: "failed",
          logs: latestChecks,
          diff: latestDiff,
        });
        feedback = latestChecks;
        continue;
      }

      const checks = await runChecks(workspace, task.checkCommands, !dependencySetupComplete);
      dependencySetupComplete = checks.dependencySetupComplete;
      latestChecks = checks.logs;
      await finishStage(checkStage.id, {
        status: checks.passed ? "passed" : "failed",
        summary: checks.commands.join(" · "),
        logs: checks.logs,
        diff: latestDiff,
      });
      if (!checks.passed) {
        feedback = `Автоматические проверки не пройдены:\n${latestChecks}`;
        continue;
      }

      await ensureActive(task.id);
      await updateTask(task.id, { status: "reviewing" });
      const reviewStage = await createStage({ taskId: task.id, kind: "review", attempt });
      let reviewer: Awaited<ReturnType<typeof runReviewer>>;
      try {
        const modelReference = await withDefaultModel(task.reviewerModel, "reviewer");
        reviewer = await runReviewer({
          task,
          modelReference,
          diff: latestDiff,
          checks: latestChecks,
          executorSummary,
        });
        await addTokens(reviewer.tokens);
        await createReview({
          taskId: task.id,
          role: "reviewer",
          verdict: reviewer.verdict,
          summary: reviewer.summary,
          issues: reviewer.issues,
          confidence: Math.round(reviewer.confidence),
          attempt,
        });
        await finishStage(reviewStage.id, {
          status: reviewer.verdict === "approve" ? "passed" : "failed",
          summary: `${reviewer.verdict}: ${reviewer.summary}`,
          logs: reviewer.issues.join("\n"),
        });
      } catch (error) {
        await finishStage(reviewStage.id, { status: "failed", logs: textError(error) });
        throw error;
      }

      if (reviewer.verdict === "rework") {
        feedback = reviewFeedback(reviewer.verdict, reviewer.summary, reviewer.issues);
        continue;
      }
      if (reviewer.verdict === "ask_user") {
        await updateTask(task.id, { status: "waiting_input", summary: reviewer.summary, error: null });
        await removeWorkspace(workspace);
        return;
      }
      if (reviewer.verdict === "reject") {
        throw new Error(`Ревьюер отклонил решение: ${reviewer.summary}`);
      }

      await ensureActive(task.id);
      await updateTask(task.id, { status: "final_review" });
      const finalStage = await createStage({ taskId: task.id, kind: "final", attempt });
      let final: Awaited<ReturnType<typeof runFinalReview>>;
      try {
        const modelReference = await withDefaultModel(task.finalModel, "final");
        final = await runFinalReview({
          task,
          modelReference,
          diff: latestDiff,
          checks: latestChecks,
          executorSummary,
          reviewerSummary: reviewer.summary,
        });
        await addTokens(final.tokens);
        await createReview({
          taskId: task.id,
          role: "final",
          verdict: final.verdict,
          summary: final.summary,
          issues: final.issues,
          confidence: Math.round(final.confidence),
          attempt,
        });
        await finishStage(finalStage.id, {
          status: final.verdict === "approve" ? "passed" : "failed",
          summary: `${final.verdict}: ${final.summary}`,
          logs: final.issues.join("\n"),
        });
      } catch (error) {
        await finishStage(finalStage.id, { status: "failed", logs: textError(error) });
        throw error;
      }

      if (final.verdict === "rework") {
        feedback = reviewFeedback(final.verdict, final.summary, final.issues);
        continue;
      }
      if (final.verdict === "ask_user") {
        await updateTask(task.id, { status: "waiting_input", summary: final.summary, error: null });
        await removeWorkspace(workspace);
        return;
      }
      if (final.verdict === "reject") {
        throw new Error(`Финальное ревью отклонило решение: ${final.summary}`);
      }

      await ensureActive(task.id);
      await updateTask(task.id, { status: "creating_pr" });
      const prStage = await createStage({ taskId: task.id, kind: "pr", attempt });
      try {
        const gitLogs = await commitAndPush(
          workspace,
          branchName,
          `${task.title.slice(0, 72)} (#${task.id})`,
        );
        const pr = await createPullRequest({
          repoUrl: task.repoUrl,
          title: task.title,
          base: task.baseBranch,
          head: branchName,
          body: `## Задача\n${task.prompt}\n\n## Результат\n${final.summary}\n\n## Проверки\n\`\`\`text\n${latestChecks.slice(-18_000)}\n\`\`\`\n\nСоздано каскадом моделей. Требуется ручное ревью перед merge.`,
        });
        await finishStage(prStage.id, {
          status: "passed",
          summary: pr.message,
          logs: gitLogs,
        });
        await updateTask(task.id, {
          status: "ready",
          summary: final.summary,
          prUrl: pr.url || null,
          completedAt: new Date(),
          error: null,
        });
        await removeWorkspace(workspace);
        return;
      } catch (error) {
        await finishStage(prStage.id, { status: "failed", logs: textError(error) });
        throw error;
      }
    }

    throw new Error(`Лимит попыток исчерпан. Последние замечания:\n${feedback || "нет данных"}`);
  } catch (error) {
    await removeWorkspace(workspace).catch(() => undefined);
    if (error instanceof CancelledError) {
      await updateTask(task.id, { status: "cancelled", completedAt: new Date() });
      return;
    }
    await updateTask(task.id, {
      status: "failed",
      error: textError(error).slice(0, 60_000),
      completedAt: new Date(),
    });
  }
}

async function poll() {
  if (state.processing || process.env.WORKER_ENABLED === "false") return;
  state.lastPollAt = new Date();
  state.processing = true;
  try {
    const task = await claimNextTask();
    if (task) {
      state.currentTaskId = task.id;
      await processTask(task);
    }
    state.lastError = null;
  } catch (error) {
    state.lastError = textError(error);
  } finally {
    state.processing = false;
    state.currentTaskId = null;
  }
}

const globalWorker = globalThis as typeof globalThis & {
  __cascadeWorkerStarted?: boolean;
};

export function startWorker() {
  if (globalWorker.__cascadeWorkerStarted || process.env.WORKER_ENABLED === "false") return;
  globalWorker.__cascadeWorkerStarted = true;
  state.workerRunning = true;
  void poll();
  const timer = setInterval(() => void poll(), 2_500);
  timer.unref();
}
