import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectCheckCommands } from "./sandbox";

let workspace = "";
afterEach(async () => {
  if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  workspace = "";
});

describe("detectCheckCommands", () => {
  it("uses explicit commands first and limits their count", async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cascade-checks-"));
    const commands = await detectCheckCommands(workspace, " npm test \n\nnpm run build\n3\n4\n5\n6");
    expect(commands).toEqual(["npm test", "npm run build", "3", "4", "5"]);
  });

  it("detects Node checks from package.json", async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cascade-checks-"));
    await fs.writeFile(path.join(workspace, "package.json"), JSON.stringify({ scripts: { test: "vitest run", build: "vite build" } }));
    expect(await detectCheckCommands(workspace)).toEqual(["npm test", "npm run build"]);
  });

  it("fails closed when no checks can be inferred", async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cascade-checks-"));
    expect(await detectCheckCommands(workspace)).toEqual([]);
  });
});
