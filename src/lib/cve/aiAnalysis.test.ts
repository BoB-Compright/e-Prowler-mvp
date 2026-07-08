import { describe, expect, it } from "vitest";
import type { CveMatch } from "./store";
import { analyzeCveImpact } from "./aiAnalysis";

function match(overrides: Partial<CveMatch> = {}): CveMatch {
  return {
    id: "m1", assetId: "a1", packageName: "openssl", packageVersion: "1.1.1f",
    cveId: "CVE-2024-0001", cvssScore: 9.1, severity: "critical", summary: "example",
    publishedAt: null, firstSeenAt: "now", checkedAt: "now", dismissed: false,
    aiImpact: null, aiRemediation: null,
    ...overrides,
  };
}

describe("analyzeCveImpact", () => {
  it("is a no-op unless CLAUDE_ANALYSIS_ENABLED=true, to avoid burning API tokens by default", async () => {
    // ANTHROPIC_API_KEY가 없어도 통과해야 한다 — 게이트가 클라이언트 생성 전에 막기 때문.
    await expect(analyzeCveImpact(match())).resolves.toBeNull();
  });
});
