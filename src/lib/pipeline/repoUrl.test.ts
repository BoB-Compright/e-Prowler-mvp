import { describe, expect, it } from "vitest";
import { getRepoDisplayName, isValidRepoUrl } from "./repoUrl";

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

describe("getRepoDisplayName", () => {
  it("extracts owner/repo from a .git URL", () => {
    expect(getRepoDisplayName("https://github.com/nh-fintech/nh-pay-gateway.git")).toBe(
      "nh-fintech/nh-pay-gateway",
    );
  });

  it("extracts owner/repo without a .git suffix", () => {
    expect(getRepoDisplayName("https://github.com/owner/repo")).toBe("owner/repo");
  });

  it("falls back to the raw URL when it doesn't match owner/repo", () => {
    expect(getRepoDisplayName("not-a-url")).toBe("not-a-url");
  });
});
