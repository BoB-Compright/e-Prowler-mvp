import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { listAssets } from "@/lib/assets/store";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { listRuns } from "./runs";
import type { Run } from "./types";

export type AssetStatusKind = RunOutcome | "error" | "running" | "cancelled" | "none";

export interface AssetStatus {
  kind: AssetStatusKind;
  runId?: string;
}

// 자산별 최신 run 기준 상태를 계산한다 (대시보드 "자산 보안 상태" 표의 판정 규칙과 동일):
// - run이 없으면 "none"(미점검)
// - 최신 run이 진행 중이면 "running"(진행 중)
// - 최신 run 자체가 실패(run.status === "failed")했으면 "error"("실패" — 취약과는
//   별개의 판정이므로 혼동 금지)
// - 최신 run이 취소(run.status === "cancelled")됐으면 "cancelled"("취소됨" —
//   미점검("none")과도, 실패/양호/취약과도 구분되는 별개의 중립 판정)
// - 최신 run이 성공했으면 체크 결과 기반 outcome("pass" | "fail" | "review")
export function getAssetStatusMap(db: Database = getDb()): Map<string, AssetStatus> {
  const assets = listAssets({}, db);
  const allRuns = listRuns(db); // 최신순 정렬 보장 (created_at DESC)

  // 자산별 마지막 run (allRuns가 최신순이므로 첫 등장 = 최신)
  const latestRunByAsset = new Map<string, Run>();
  for (const run of allRuns) {
    if (run.assetId && !latestRunByAsset.has(run.assetId)) {
      latestRunByAsset.set(run.assetId, run);
    }
  }

  const statusByAsset = new Map<string, AssetStatus>();
  for (const asset of assets) {
    const run = latestRunByAsset.get(asset.id);
    if (!run) {
      statusByAsset.set(asset.id, { kind: "none" });
      continue;
    }
    if (run.status === "running") {
      statusByAsset.set(asset.id, { kind: "running", runId: run.id });
      continue;
    }
    if (run.status === "failed") {
      statusByAsset.set(asset.id, { kind: "error", runId: run.id });
      continue;
    }
    if (run.status === "cancelled") {
      statusByAsset.set(asset.id, { kind: "cancelled", runId: run.id });
      continue;
    }
    const summary = getRunRiskSummary(run.id, db);
    statusByAsset.set(asset.id, { kind: overallRunOutcome(summary), runId: run.id });
  }
  return statusByAsset;
}
