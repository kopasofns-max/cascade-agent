import { afterEach, describe, expect, it } from "vitest";
import { redactSecrets } from "./process";

const originalToken = process.env.GITHUB_TOKEN;
afterEach(() => {
  if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalToken;
});

describe("redactSecrets", () => {
  it("hides configured tokens and credentials in URLs", () => {
    process.env.GITHUB_TOKEN = "secret-token-123";
    const result = redactSecrets("secret-token-123 https://user:pass@github.com/a/b Authorization: Bearer abcdef");
    expect(result).not.toContain("secret-token-123");
    expect(result).not.toContain("user:pass");
    expect(result).not.toContain("abcdef");
    expect(result).toContain("<redacted>");
  });
});
