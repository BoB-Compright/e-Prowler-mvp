import type { AssetStatusKind } from "@/lib/pipeline/assetStatus";

export interface RiskyAssetRow {
  assetId: string;
  displayName: string;
  assetType: "repo" | "server";
  statusKind: AssetStatusKind;
  criticalHigh: number; // 최근 점검의 Critical+High fail 항목 수
  openCveCount: number; // 미해제 CVE 수 (repo 자산은 0)
}

// 낮을수록 위험. 실패(error)는 결과를 모르니 미점검보다 위로 둔다.
const STATUS_RANK: Record<AssetStatusKind, number> = {
  fail: 0, review: 1, error: 2, none: 3, cancelled: 4, running: 5, pass: 6,
};

export function rankRiskyAssets(rows: RiskyAssetRow[], limit = 5): RiskyAssetRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        STATUS_RANK[a.statusKind] - STATUS_RANK[b.statusKind] ||
        b.criticalHigh - a.criticalHigh ||
        b.openCveCount - a.openCveCount ||
        a.displayName.localeCompare(b.displayName, "ko"),
    )
    .slice(0, limit);
}
