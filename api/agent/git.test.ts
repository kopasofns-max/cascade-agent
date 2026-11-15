import { describe, expect, it } from "vitest";
import { parseGitHubRepository } from "./git";

describe("parseGitHubRepository", () => {
  it("accepts canonical GitHub URLs", () => {
    expect(parseGitHubRepository("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseGitHubRepository("https://github.com/owner/repo.git/")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("rejects credentials, SSH URLs and nested paths", () => {
    expect(() => parseGitHubRepository("https://token@github.com/owner/repo")).toThrow();
    expect(() => parseGitHubRepository("git@github.com:owner/repo.git")).toThrow();
    expect(() => parseGitHubRepository("https://github.com/owner/repo/issues")).toThrow();
  });
});
