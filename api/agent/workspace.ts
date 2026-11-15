import { promises as fs } from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  ".turbo",
  "coverage",
]);

function inside(root: string, relativePath: string) {
  const normalized = path.normalize(relativePath || ".");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Путь выходит за пределы рабочей директории");
  }
  const resolved = path.resolve(root, normalized);
  if (resolved !== path.resolve(root) && !resolved.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error("Небезопасный путь");
  }
  return resolved;
}

async function realInside(root: string, relativePath: string) {
  const candidate = inside(root, relativePath);
  const [realRoot, realCandidate] = await Promise.all([
    fs.realpath(root),
    fs.realpath(candidate).catch(() => candidate),
  ]);
  if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("Символическая ссылка ведёт за пределы рабочей директории");
  }
  return candidate;
}

export async function listWorkspaceFiles(root: string, relativePath = ".") {
  const start = await realInside(root, relativePath);
  const files: string[] = [];

  async function walk(current: string, prefix: string) {
    if (files.length >= 600) return;
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= 600) break;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      const relative = path.join(prefix, entry.name);
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
    }
  }

  const stat = await fs.stat(start);
  if (stat.isFile()) return [path.basename(start)];
  await walk(start, relativePath === "." ? "" : relativePath);
  return files;
}

export async function readWorkspaceFile(root: string, relativePath: string, maxChars = 60_000) {
  const absolute = await realInside(root, relativePath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error("Это не файл");
  if (stat.size > 2_000_000) throw new Error("Файл слишком большой для чтения моделью");
  const content = await fs.readFile(absolute, "utf8");
  return content.slice(0, maxChars);
}

export async function writeWorkspaceFile(root: string, relativePath: string, content: string) {
  if (content.length > 1_000_000) throw new Error("Файл слишком большой");
  const absolute = inside(root, relativePath);
  const parent = path.dirname(absolute);
  await fs.mkdir(parent, { recursive: true });
  const realParent = await fs.realpath(parent);
  const realRoot = await fs.realpath(root);
  if (!realParent.startsWith(`${realRoot}${path.sep}`) && realParent !== realRoot) {
    throw new Error("Запись за пределы рабочей директории запрещена");
  }
  await fs.writeFile(absolute, content, "utf8");
}

export async function deleteWorkspaceFile(root: string, relativePath: string) {
  const absolute = await realInside(root, relativePath);
  await fs.rm(absolute, { force: true });
}

export async function readRepositoryBrief(root: string) {
  const files = await listWorkspaceFiles(root);
  const preferred = files.filter((file) =>
    /^(readme(\..+)?|package\.json|pyproject\.toml|requirements\.txt|cargo\.toml|go\.mod)$/i.test(file),
  );
  const sections = [`ФАЙЛЫ ПРОЕКТА (максимум 600):\n${files.join("\n")}`];
  let remaining = 35_000;
  for (const file of preferred.slice(0, 5)) {
    if (remaining <= 0) break;
    const content = await readWorkspaceFile(root, file, Math.min(remaining, 15_000));
    sections.push(`\n--- ${file} ---\n${content}`);
    remaining -= content.length;
  }
  return sections.join("\n");
}

export async function removeWorkspace(root: string) {
  await fs.rm(root, { recursive: true, force: true });
}
