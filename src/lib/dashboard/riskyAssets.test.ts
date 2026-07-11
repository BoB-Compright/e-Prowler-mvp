import { describe, expect, it } from "vitest";
import { rankRiskyAssets, type RiskyAssetRow } from "./riskyAssets";

function row(partial: Partial<RiskyAssetRow> & { assetId: string }): RiskyAssetRow {
  return {
    displayName: partial.assetId,
    assetType: "repo",
    statusKind: "pass",
    criticalHigh: 0,
    openCveCount: 0,
    ...partial,
  };
}

describe("rankRiskyAssets", () => {
  it("상태 우선순위: 취약 > 검토 > 실패 > 미점검 > 취소 > 진행 중 > 양호", () => {
    const ranked = rankRiskyAssets([
      row({ assetId: "a-pass", statusKind: "pass" }),
      row({ assetId: "a-fail", statusKind: "fail" }),
      row({ assetId: "a-none", statusKind: "none" }),
      row({ assetId: "a-review", statusKind: "review" }),
      row({ assetId: "a-error", statusKind: "error" }),
    ]);
    expect(ranked.map((r) => r.assetId)).toEqual([
      "a-fail", "a-review", "a-error", "a-none", "a-pass",
    ]);
  });

  it("동순위면 C/H 항목 수 → CVE 수 내림차순", () => {
    const ranked = rankRiskyAssets([
      row({ assetId: "x", statusKind: "fail", criticalHigh: 1, openCveCount: 9 }),
      row({ assetId: "y", statusKind: "fail", criticalHigh: 5, openCveCount: 0 }),
      row({ assetId: "z", statusKind: "fail", criticalHigh: 1, openCveCount: 20 }),
    ]);
    expect(ranked.map((r) => r.assetId)).toEqual(["y", "z", "x"]);
  });

  it("limit 만큼 자른다 (기본 5)", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ assetId: `a${i}` }));
    expect(rankRiskyAssets(rows)).toHaveLength(5);
    expect(rankRiskyAssets(rows, 3)).toHaveLength(3);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const rows = [row({ assetId: "b", statusKind: "pass" }), row({ assetId: "a", statusKind: "fail" })];
    rankRiskyAssets(rows);
    expect(rows[0].assetId).toBe("b");
  });
});
