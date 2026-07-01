import { describe, expect, it } from "vitest";
import { isValidRepoUrl } from "./repoUrl";

describe("isValidRepoUrl", () => {
  it("accepts common remote URL forms", () => {
    expect(isValidRepoUrl("https://github.com/owner/repo.git")).toBe(true);
    expect(isValidRepoUrl("https://github.com/owner/repo")).toBe(true);
    expect(isValidRepoUrl("git@github.com:owner/repo.git")).toBe(true);
  });

  it("rejects empty, garbage, and flag-like input", () => {
    expect(isValidRepoUrl("")).toBe(false);
    expect(isValidRepoUrl("not a url")).toBe(false);
    expect(isValidRepoUrl("--upload-pack=evil")).toBe(false);
    expect(isValidRepoUrl("javascript:alert(1)")).toBe(false);
  });
});
