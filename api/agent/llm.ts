import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { REVIEW_ISSUES_SCHEMA_DESCRIPTION } from "@contracts/agent";
import { classifyAiError } from "../ai/ai-client";
import { resolveModel } from "../ai/models";
import type { AgentTask } from "@db/schema";
import {
  deleteWorkspaceFile,
  listWorkspaceFiles,
  readRepositoryBrief,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "./workspace";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runExecutor(options: {
  task: AgentTask;
  workspace: string;
  modelReference: string;
  feedback?: string;
}) {
  const { task, workspace } = options;
  const repositoryBrief = await readRepositoryBrief(workspace);
  const tools = {
    list_files: tool({
      description: "Показать файлы проекта. Можно указать относительную директорию.",
      inputSchema: z.object({ path: z.string().optional() }),
      execute: async ({ path }) => {
        try {
          return (await listWorkspaceFiles(workspace, path || ".")).join("\n") || "Файлов нет";
        } catch (error) {
          return `Ошибка: ${errorText(error)}`;
        }
      },
    }),
    read_file: tool({
      description: "Прочитать текстовый файл из репозитория.",
      inputSchema: z.object({ path: z.string().min(1) }),
      execute: async ({ path }) => {
        try {
          return await readWorkspaceFile(workspace, path);
        } catch (error) {
          return `Ошибка: ${errorText(error)}`;
        }
      },
    }),
    write_file: tool({
      description: "Создать файл или полностью перезаписать существующий. Для небольших правок сначала прочитай файл.",
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
      execute: async ({ path, content }) => {
        try {
          await writeWorkspaceFile(workspace, path, content);
          return `Файл ${path} записан`;
        } catch (error) {
          return `Ошибка: ${errorText(error)}`;
        }
      },
    }),
    delete_file: tool({
      description: "Удалить файл, только если это действительно требуется задачей.",
      inputSchema: z.object({ path: z.string().min(1) }),
      execute: async ({ path }) => {
        try {
          await deleteWorkspaceFile(workspace, path);
          return `Файл ${path} удалён`;
        } catch (error) {
          return `Ошибка: ${errorText(error)}`;
        }
      },
    }),
  };

  try {
    const result = await generateText({
      model: resolveModel(options.modelReference),
      tools,
      stopWhen: stepCountIs(18),
      system: `Ты — модель-исполнитель в coding-agent. Работаешь только через инструменты list_files, read_file, write_file, delete_file.
Сначала изучи проект, затем вноси минимальные изменения, необходимые задаче. Не меняй посторонние файлы и не удаляй существующую функциональность.
Не заявляй, что запускал тесты: автоматические проверки выполнит отдельная система после тебя. Добавь или обнови тесты, если это уместно.
В финальном ответе кратко перечисли изменения и что нужно проверить.`,
      prompt: `ЗАДАЧА: ${task.title}
ТИП: ${task.taskType}
ОПИСАНИЕ:
${task.prompt}

КРИТЕРИИ ПРИЁМКИ:
${task.acceptanceCriteria}

${options.feedback ? `ЗАМЕЧАНИЯ ПРЕДЫДУЩЕЙ ПРОВЕРКИ — ИСПРАВЬ ИХ В ПЕРВУЮ ОЧЕРЕДЬ:\n${options.feedback}` : ""}

${repositoryBrief}`,
    });
    const toolEvents = result.steps.flatMap((step) =>
      step.toolCalls.map((call) => `${call.toolName}: ${JSON.stringify(call.input)}`),
    );
    return {
      summary: result.text || "Исполнитель завершил работу с файлами без текстового отчёта",
      tokens: result.totalUsage.totalTokens || 0,
      toolEvents,
    };
  } catch (error) {
    throw classifyAiError(error);
  }
}

const reviewSchema = z.object({
  verdict: z.enum(["approve", "rework", "ask_user", "reject"]),
  summary: z.string().min(1),
  issues: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
});

function reviewPrompt(options: {
  task: AgentTask;
  diff: string;
  checks: string;
  executorSummary: string;
  reviewerSummary?: string;
}) {
  const { task } = options;
  return `ИСХОДНАЯ ЗАДАЧА: ${task.title}
${task.prompt}

КРИТЕРИИ ПРИЁМКИ:
${task.acceptanceCriteria}

ОТЧЁТ ИСПОЛНИТЕЛЯ (это не доказательство):
${options.executorSummary}

${options.reviewerSummary ? `ВЕРДИКТ ПЕРВОГО РЕВЬЮЕРА:\n${options.reviewerSummary}` : ""}

АВТОМАТИЧЕСКИЕ ПРОВЕРКИ:
${options.checks.slice(0, 60_000)}

DIFF:
${options.diff.slice(0, 150_000) || "(пустой diff)"}`;
}

export async function runReviewer(options: {
  task: AgentTask;
  modelReference: string;
  diff: string;
  checks: string;
  executorSummary: string;
}) {
  try {
    const result = await generateObject({
      model: resolveModel(options.modelReference),
      schema: reviewSchema,
      system: `Ты — независимый senior-ревьюер. Не доверяй отчёту исполнителя. Сверяй исходную задачу, diff и реальные логи проверок.
Если проверки не доказывают ключевой критерий приёмки, verdict должен быть rework. Не требуй косметические улучшения вне задачи.
${REVIEW_ISSUES_SCHEMA_DESCRIPTION}`,
      prompt: reviewPrompt(options),
    });
    return { ...result.object, tokens: result.usage.totalTokens || 0 };
  } catch (error) {
    throw classifyAiError(error);
  }
}

export async function runFinalReview(options: {
  task: AgentTask;
  modelReference: string;
  diff: string;
  checks: string;
  executorSummary: string;
  reviewerSummary: string;
}) {
  try {
    const result = await generateObject({
      model: resolveModel(options.modelReference),
      schema: reviewSchema,
      system: `Ты — Kimi, финальный контролёр coding-agent. Принимаешь решение после независимого ревьюера.
Проверь безопасность изменений, соответствие задаче, качество доказательств и отсутствие скрытых проблем.
approve означает, что можно создать Pull Request, но не автоматически сливать его. ask_user выбирай только при реальной продуктовой неопределённости.
${REVIEW_ISSUES_SCHEMA_DESCRIPTION}`,
      prompt: reviewPrompt(options),
    });
    return { ...result.object, tokens: result.usage.totalTokens || 0 };
  } catch (error) {
    throw classifyAiError(error);
  }
}
