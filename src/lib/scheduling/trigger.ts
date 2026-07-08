import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Asset } from "@/lib/assets/types";
import { createRun, markRunTriggerType } from "@/lib/pipeline/runs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { createServerRun, runServerScanPipeline } from "@/lib/pipeline/serverScan";
import type { RunTriggerType } from "@/lib/pipeline/types";

export interface TriggerDeps {
  runPipeline: typeof runPipeline;
  runServerScanPipeline: typeof runServerScanPipeline;
}

const defaultDeps: TriggerDeps = { runPipeline, runServerScanPipeline };

export function hasActiveRun(assetId: string, db: Database = getDb()): boolean {
  const row = db.prepare(`SELECT 1 FROM runs WHERE asset_id = ? AND status = 'running'`).get(assetId);
  return row !== undefined;
}

// 수동 트리거(POST /api/runs)와 동일한 실행 경로를 그대로 타고(레포는 createRun +
// runPipeline fire-and-forget, 서버는 createServerRun + runServerScanPipeline
// fire-and-forget), 생성된 run에만 trigger_type을 남긴다. 서버 경로도 스캔 완료를
// 기다리지 않고 즉시 반환해야 스케줄러 루프가 다음 스케줄로 곧바로 넘어갈 수 있다.
export async function triggerRunForAsset(
  asset: Asset,
  triggerType: RunTriggerType,
  deps: TriggerDeps = defaultDeps,
  db: Database = getDb(),
): Promise<string> {
  if (asset.type === "server") {
    const { run, asset: serverAsset } = createServerRun(asset.id, null, db);
    void deps.runServerScanPipeline(run, serverAsset, undefined, db);
    markRunTriggerType(run.id, triggerType, db);
    return run.id;
  }
  const run = createRun(asset.repoUrl!, "git", asset.id, db);
  void deps.runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! }, undefined, db);
  markRunTriggerType(run.id, triggerType, db);
  return run.id;
}
