import { promises as fs } from "node:fs";
import path from "node:path";
import { formatProcessResult, runProcess, type ProcessResult } from "./process";

export type SandboxBackend = "docker" | "bwrap";
let detectedBackend: SandboxBackend | undefined;

export async function detectSandboxBackend(): Promise<SandboxBackend> {
  const configured = process.env.SANDBOX_BACKEND;
  if (configured === "docker" || configured === "bwrap") return configured;
  if (detectedBackend) return detectedBackend;
  const docker = await runProcess({ command: "docker", args: ["--version"], timeoutMs: 5_000 }).catch(() => undefined);
  detectedBackend = docker?.code === 0 ? "docker" : "bwrap";
  return detectedBackend;
}

async function runInDocker(workspace: string, command: string, timeoutMs: number, allowNetwork: boolean) {
  const network = allowNetwork ? "bridge" : "none";
  return runProcess({
    command: "docker",
    args: [
      "run", "--rm",
      "--network", network,
      "--cpus", process.env.SANDBOX_CPUS || "1",
      "--memory", process.env.SANDBOX_MEMORY || "2g",
      "--pids-limit", "256",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--read-only",
      "--tmpfs", "/tmp:rw,nosuid,nodev",
      "-v", `${path.resolve(workspace)}:/workspace:rw`,
      "-w", "/workspace",
      "-e", "CI=1",
      "-e", "HOME=/tmp",
      process.env.SANDBOX_IMAGE || "node:22-bookworm",
      "bash", "--noprofile", "--norc", "-c", command,
    ],
    timeoutMs,
  });
}

async function runInBubblewrap(workspace: string, command: string, timeoutMs: number, allowNetwork: boolean) {
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-user-try",
    "--unshare-ipc",
    "--unshare-pid",
    "--unshare-uts",
    "--unshare-cgroup-try",
    ...(allowNetwork ? [] : ["--unshare-net"]),
    "--clearenv",
    "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
    "--setenv", "HOME", "/tmp",
    "--setenv", "CI", "1",
    "--ro-bind", "/usr", "/usr",
    "--ro-bind-try", "/lib", "/lib",
    "--ro-bind-try", "/lib64", "/lib64",
    "--ro-bind-try", "/bin", "/bin",
    "--ro-bind-try", "/etc", "/etc",
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--bind", path.resolve(workspace), "/workspace",
    "--chdir", "/workspace",
    "--",
    "/bin/bash", "--noprofile", "--norc", "-c", command,
  ];
  return runProcess({ command: "bwrap", args, timeoutMs });
}

export async function runInSandbox(options: {
  workspace: string;
  command: string;
  timeoutMs?: number;
  network?: boolean;
}): Promise<ProcessResult> {
  const backend = await detectSandboxBackend();
  const timeoutMs = options.timeoutMs || Number(process.env.CHECK_TIMEOUT_MS || 180_000);
  const allowNetwork = options.network ?? process.env.SANDBOX_NETWORK === "true";
  if (backend === "docker") return runInDocker(options.workspace, options.command, timeoutMs, allowNetwork);
  return runInBubblewrap(options.workspace, options.command, timeoutMs, allowNetwork);
}

export async function detectCheckCommands(workspace: string, configured?: string | null) {
  const manual = configured
    ?.split(/\r?\n/)
    .map((command) => command.trim())
    .filter(Boolean);
  if (manual?.length) return manual.slice(0, 5);

  const commands: string[] = [];
  const packageJsonPath = path.join(workspace, "package.json");
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (packageJson.scripts?.test) commands.push("npm test");
    if (packageJson.scripts?.build) commands.push("npm run build");
  } catch {
    // Not a Node project or package.json is invalid; the test command will report it.
  }

  const entries = await fs.readdir(workspace);
  if (entries.some((entry) => ["pytest.ini", "pyproject.toml", "tox.ini"].includes(entry))) {
    commands.push("python -m pytest");
  }
  return commands.slice(0, 4);
}

export async function prepareDependencies(workspace: string) {
  if (process.env.SANDBOX_INSTALL === "false") return { passed: true, logs: "" };
  try {
    await fs.access(path.join(workspace, "package.json"));
  } catch {
    return { passed: true, logs: "" };
  }

  let lockfile = false;
  try {
    await fs.access(path.join(workspace, "package-lock.json"));
    lockfile = true;
  } catch {
    // npm install is the fallback for repositories without a lockfile.
  }
  const command = `${lockfile ? "npm ci" : "npm install"} --ignore-scripts --no-audit --no-fund`;
  const result = await runInSandbox({
    workspace,
    command,
    timeoutMs: Number(process.env.INSTALL_TIMEOUT_MS || 600_000),
    network: true,
  });
  return {
    passed: result.code === 0,
    logs: `\n$ ${command}  # сеть только для установки\n${formatProcessResult(result)}`,
  };
}

export async function runChecks(workspace: string, configured?: string | null, installDependencies = false) {
  let dependencyLogs = "";
  if (installDependencies) {
    const installation = await prepareDependencies(workspace);
    dependencyLogs = installation.logs;
    if (!installation.passed) {
      return { passed: false, commands: [], logs: dependencyLogs, dependencySetupComplete: false };
    }
  }

  const commands = await detectCheckCommands(workspace, configured);
  if (!commands.length) {
    return {
      passed: false,
      commands,
      logs: `${dependencyLogs}\nНе удалось определить команды проверки. Укажи их в задаче, например: npm test`,
      dependencySetupComplete: true,
    };
  }

  const results: string[] = [];
  let passed = true;
  for (const command of commands) {
    results.push(`\n$ ${command}  # сеть отключена`);
    const result = await runInSandbox({ workspace, command, network: false });
    results.push(formatProcessResult(result));
    if (result.code !== 0) {
      passed = false;
      break;
    }
  }
  return {
    passed,
    commands,
    logs: [dependencyLogs, ...results].filter(Boolean).join("\n"),
    dependencySetupComplete: true,
  };
}
