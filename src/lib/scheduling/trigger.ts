import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Asset } from "@/lib/assets/types";
import { createRun, markRunTriggerType } from "@/lib/pipeline/runs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { scanServerAsset } from "@/lib/pipeline/serverScan";
import type { RunTriggerType } from "@/lib/pipeline/types";

export interface TriggerDeps {
  runPipeline: typeof runPipeline;
  scanServerAsset: typeof scanServerAsset;
}

const defaultDeps: TriggerDeps = { runPipeline, scanServerAsset };

export function hasActiveRun(assetId: string, db: Database = getDb()): boolean {
  const row = db.prepare(`SELECT 1 FROM runs WHERE asset_id = ? AND status = 'running'`).get(assetId);
  return row !== undefined;
}

// 수동 트리거(POST /api/runs, POST /api/projects/[id]/scan)와 동일한 실행 경로를
// 그대로 타고, 생성된 run에만 trigger_type을 남긴다.
export async function triggerRunForAsset(
  asset: Asset,
  triggerType: RunTriggerType,
  deps: TriggerDeps = defaultDeps,
  db: Database = getDb(),
): Promise<string> {
  if (asset.type === "server") {
    const runId = await deps.scanServerAsset(asset.id, null);
    markRunTriggerType(runId, triggerType, db);
    return runId;
  }
  const run = createRun(asset.repoUrl!, "git", asset.id, db);
  void deps.runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! }, undefined, db);
  markRunTriggerType(run.id, triggerType, db);
  return run.id;
}
