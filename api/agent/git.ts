import { promises as fs } from "node:fs";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import { formatProcessResult, runProcess } from "./process";

export type GitHubRepository = { owner: string; repo: string };

export function parseGitHubRepository(repoUrl: string): GitHubRepository {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (!match) throw new Error("Поддерживаются URL вида https://github.com/owner/repository");
  return { owner: match[1], repo: match[2] };
}

export function validateRepositoryUrl(repoUrl: string) {
  if (repoUrl.startsWith("file://")) {
    if (process.env.ALLOW_LOCAL_REPOS !== "true") {
      throw new Error("Локальные репозитории отключены. Укажите GitHub URL");
    }
    return;
  }
  parseGitHubRepository(repoUrl);
}

function gitEnvironment() {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: bearer ${token}`;
  }
  return env;
}

async function git(cwd: string | undefined, args: string[], timeoutMs = 120_000) {
  const result = await runProcess({
    command: "git",
    args,
    cwd,
    env: gitEnvironment(),
    timeoutMs,
  });
  if (result.code !== 0) {
    throw new Error(`git ${args[0]} завершился с ошибкой\n${formatProcessResult(result)}`);
  }
  return result;
}

export async function cloneRepository(options: {
  repoUrl: string;
  baseBranch: string;
  branchName: string;
  workspace: string;
}) {
  validateRepositoryUrl(options.repoUrl);
  await fs.rm(options.workspace, { recursive: true, force: true });
  await fs.mkdir(path.dirname(options.workspace), { recursive: true });
  const clone = await git(undefined, [
    "clone",
    "--depth",
    "1",
    "--branch",
    options.baseBranch,
    "--",
    options.repoUrl,
    options.workspace,
  ]);
  await git(options.workspace, ["checkout", "-b", options.branchName]);
  return formatProcessResult(clone);
}

export async function getRepositoryDiff(workspace: string) {
  await git(workspace, ["add", "-N", "."]);
  const [status, stat, diff] = await Promise.all([
    git(workspace, ["status", "--short"]),
    git(workspace, ["diff", "--stat"]),
    git(workspace, ["--no-pager", "diff", "--no-ext-diff", "--unified=3"]),
  ]);
  return {
    status: status.stdout.trim(),
    stat: stat.stdout.trim(),
    diff: diff.stdout.slice(0, 220_000),
  };
}

export async function hasRepositoryChanges(workspace: string) {
  const status = await git(workspace, ["status", "--porcelain"]);
  return status.stdout.trim().length > 0;
}

export async function commitAndPush(workspace: string, branchName: string, message: string) {
  await git(workspace, ["add", "-A"]);
  const commit = await git(workspace, [
    "-c",
    "user.name=Cascade Agent",
    "-c",
    "user.email=cascade-agent@users.noreply.github.com",
    "commit",
    "-m",
    message,
  ]);
  const push = await git(workspace, ["push", "--set-upstream", "origin", branchName], 180_000);
  return `${formatProcessResult(commit)}\n${formatProcessResult(push)}`;
}

export async function createPullRequest(options: {
  repoUrl: string;
  title: string;
  body: string;
  head: string;
  base: string;
}) {
  if (options.repoUrl.startsWith("file://")) {
    return { url: undefined, message: "Ветка отправлена в локальный Git remote" };
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN не настроен: ветка подготовлена, но PR не создан");
  }
  const { owner, repo } = parseGitHubRepository(options.repoUrl);
  const octokit = new Octokit({ auth: token });
  const response = await octokit.rest.pulls.create({
    owner,
    repo,
    title: options.title.slice(0, 200),
    body: options.body.slice(0, 55_000),
    head: options.head,
    base: options.base,
  });
  return { url: response.data.html_url, message: `Pull Request #${response.data.number} создан` };
}
