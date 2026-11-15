import { spawn } from "node:child_process";

export type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

const OUTPUT_LIMIT = 240_000;

function limitedAppend(current: string, chunk: Buffer) {
  if (current.length >= OUTPUT_LIMIT) return current;
  return `${current}${chunk.toString("utf8")}`.slice(0, OUTPUT_LIMIT);
}

export function redactSecrets(value: string) {
  const secrets = [
    process.env.GITHUB_TOKEN,
    process.env.GEMINI_API_KEY,
    process.env.KIMI_API_KEY,
    process.env.KIMI_AGENTGW_API_KEY,
  ].filter((item): item is string => Boolean(item));
  let result = value;
  for (const secret of secrets) result = result.replaceAll(secret, "<redacted>");
  return result
    .replace(/https:\/\/[^/\s]+@github\.com/gi, "https://<redacted>@github.com")
    .replace(/(authorization:\s*bearer\s+)[^\s"']+/gi, "$1<redacted>");
}

export async function runProcess(options: {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<ProcessResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = limitedAppend(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = limitedAppend(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}

export function formatProcessResult(result: ProcessResult) {
  return [
    `exit_code=${result.code}`,
    `duration_ms=${result.durationMs}`,
    result.timedOut ? "timed_out=true" : "",
    "--- stdout ---",
    result.stdout || "(empty)",
    "--- stderr ---",
    result.stderr || "(empty)",
  ].filter(Boolean).join("\n");
}
