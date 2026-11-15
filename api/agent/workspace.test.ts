import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from "./workspace";

let workspace = "";
afterEach(async () => {
  if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  workspace = "";
});

describe("workspace guards", () => {
  it("reads and writes inside the root", async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cascade-workspace-"));
    await writeWorkspaceFile(workspace, "src/example.txt", "ok");
    expect(await readWorkspaceFile(workspace, "src/example.txt")).toBe("ok");
    expect(await listWorkspaceFiles(workspace)).toEqual(["src/example.txt"]);
  });

  it("blocks path traversal", async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cascade-workspace-"));
    await expect(writeWorkspaceFile(workspace, "../outside.txt", "no")).rejects.toThrow();
    await expect(readWorkspaceFile(workspace, "/etc/passwd")).rejects.toThrow();
  });

  it("does not follow symlinks outside the root", async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cascade-workspace-"));
    await fs.symlink("/etc", path.join(workspace, "escape"));
    await expect(readWorkspaceFile(workspace, "escape/passwd")).rejects.toThrow();
  });
});
