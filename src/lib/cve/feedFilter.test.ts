import { describe, expect, it } from "vitest";
import { applyCveFilter } from "./feedFilter";
import type { FeedRow } from "./feedStore";

function row(over: Partial<FeedRow>): FeedRow {
  return {
    cveId: "CVE-2026-0001",
    publishedAt: "2026-07-10T00:00:00.000Z",
    severity: "high",
    cvssScore: 7.5,
    summary: "buffer overflow in libfoo",
    collectedAt: "2026-07-14T00:00:00.000Z",
    collectedLabel: "방금",
    assetMatches: 0,
    ...over,
  };
}

const feed: FeedRow[] = [
  row({ cveId: "CVE-2026-0001", assetMatches: 0, summary: "unrelated issue" }),
  row({ cveId: "CVE-2026-0002", assetMatches: 2, summary: "nginx flaw", severity: "critical" }),
  row({ cveId: "CVE-2026-0003", assetMatches: 1, summary: "postgres bug", severity: "medium" }),
];

describe("applyCveFilter", () => {
  it("all + 빈 검색 → 전부", () => {
    expect(applyCveFilter(feed, "all", "", {}).length).toBe(3);
  });
  it("actionable → assetMatches>0만", () => {
    const r = applyCveFilter(feed, "actionable", "", {});
    expect(r.map((c) => c.cveId)).toEqual(["CVE-2026-0002", "CVE-2026-0003"]);
  });
  it("all + 검색어 → 부분일치(설명)", () => {
    const r = applyCveFilter(feed, "all", "nginx", {});
    expect(r.map((c) => c.cveId)).toEqual(["CVE-2026-0002"]);
  });
  it("actionable + 검색어 → AND", () => {
    const r = applyCveFilter(feed, "actionable", "postgres", {});
    expect(r.map((c) => c.cveId)).toEqual(["CVE-2026-0003"]);
    // unrelated(0001)은 검색과 무관, actionable이라 0002는 postgres 아님 → 0003만
  });
  it("검색어가 CVE ID로도 매칭", () => {
    expect(applyCveFilter(feed, "all", "0002", {}).map((c) => c.cveId)).toEqual(["CVE-2026-0002"]);
  });
  it("ko 번역 텍스트로도 검색", () => {
    const ko = { "CVE-2026-0001": "한글 설명 특이키워드" };
    expect(applyCveFilter(feed, "all", "특이키워드", ko).map((c) => c.cveId)).toEqual(["CVE-2026-0001"]);
  });
  it("actionable + 매칭 없음 → 빈 배열", () => {
    const noMatch = [row({ cveId: "X", assetMatches: 0 })];
    expect(applyCveFilter(noMatch, "actionable", "", {})).toEqual([]);
  });
});
