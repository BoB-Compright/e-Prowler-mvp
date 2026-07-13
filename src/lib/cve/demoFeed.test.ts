import { describe, expect, it } from "vitest";
import { DEMO_CVE_FEED, actionRequired } from "./demoFeed";

describe("demo CVE feed", () => {
  it("derives 조치 필요 from asset matches, never hardcoded", () => {
    expect(actionRequired(0)).toBe(false);
    expect(actionRequired(1)).toBe(true);
    expect(actionRequired(2)).toBe(true);
  });

  it("keeps the intended contrast rows (high CVSS + no match = 해당 없음, old + match = 조치 필요)", () => {
    const byId = Object.fromEntries(DEMO_CVE_FEED.map((c) => [c.cveId, c]));
    // 고위험이지만 영향 없음 → 조치 불필요
    expect(byId["CVE-2026-1042"].cvss).toBe(9.1);
    expect(actionRequired(byId["CVE-2026-1042"].assetMatches)).toBe(false);
    // 오래됐지만 매칭 → 조치 필요
    expect(byId["CVE-2024-1086"].publishedDate.startsWith("2024")).toBe(true);
    expect(actionRequired(byId["CVE-2024-1086"].assetMatches)).toBe(true);
    // 2023 재부상 취약점, 매칭 → 조치 필요
    expect(actionRequired(byId["CVE-2023-38545"].assetMatches)).toBe(true);
  });

  it("funnel stats reflect the filtering effect (수집 > critical > 매칭)", () => {
    const collected = DEMO_CVE_FEED.length;
    const critical = DEMO_CVE_FEED.filter((c) => c.severity === "Critical").length;
    const matched = DEMO_CVE_FEED.filter((c) => c.assetMatches > 0).length;
    expect(collected).toBe(8);
    expect(critical).toBe(2);
    expect(matched).toBe(3);
  });
});
