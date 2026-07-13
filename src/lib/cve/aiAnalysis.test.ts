import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CveMatch } from "./store";

function match(overrides: Partial<CveMatch> = {}): CveMatch {
  return {
    id: "m1", assetId: "a1", packageName: "openssl", packageVersion: "1.1.1f",
    cveId: "CVE-2024-0001", cvssScore: 9.1, severity: "critical", summary: "example",
    publishedAt: null, firstSeenAt: "now", checkedAt: "now", dismissed: false,
    aiImpact: null, aiRemediation: null,
    ...overrides,
  };
}

// 게이트는 env(CLAUDE_ANALYSIS_ENABLED)와 DB 토글(app_settings) 중 하나라도 켜지면 열린다.
// 이 테스트는 "둘 다 꺼진 기본 상태"를 검증하므로, 공유 파일 DB의 토글 상태에 오염되지
// 않도록 :memory: 격리 + env 해제 후 모듈을 새로 로드한다.
beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  delete process.env.CLAUDE_ANALYSIS_ENABLED;
});

describe("analyzeCveImpact", () => {
  it("is a no-op unless enabled (env or DB toggle), to avoid burning API tokens by default", async () => {
    // ANTHROPIC_API_KEY가 없어도 통과해야 한다 — 게이트가 클라이언트 생성 전에 막기 때문.
    const { analyzeCveImpact } = await import("./aiAnalysis");
    await expect(analyzeCveImpact(match())).resolves.toBeNull();
  });
});
