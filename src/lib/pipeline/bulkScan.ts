import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getAsset } from "@/lib/assets/store";
import type { Asset } from "@/lib/assets/types";
import { createScanBatch } from "./scanBatches";
import {
  createRepoRun,
  createServerRun,
  repoScanConcurrency,
  runServerScanPipeline,
  runWithConcurrency,
  type ServerScanDeps,
} from "./serverScan";
import { runPipeline } from "./orchestrator";

const BULK_SCAN_CONCURRENCY = 5;

export interface BulkScanResult {
  batchId: string | null; // 시작 가능한 자산이 없으면 null (배치 미생성)
  startedRunIds: string[];
  skipped: string[]; // 이미 실행 중인 점검이 있어 건너뛴 assetId
}

function hasRunningRun(assetId: string, db: Database): boolean {
  return !!db.prepare(`SELECT id FROM runs WHERE asset_id = ? AND status = 'running' LIMIT 1`).get(assetId);
}

// startProjectFleetScan의 자산 선택 버전: 프로젝트 대신 assetIds를 받아 하나의
// 배치로 fire-and-forget 스캔한다. run 행은 동기로 만들어 호출자가 즉시
// 배치 페이지로 이동할 수 있게 한다. 존재하지 않는 id는 무시, 실행 중 점검이
// 있는 자산은 중복 run 방지를 위해 건너뛰고 skipped로 보고한다.
export function startAssetsBulkScan(
  assetIds: string[],
  deps?: ServerScanDeps,
  db: Database = getDb(),
): BulkScanResult {
  const assets = assetIds
    .map((id) => getAsset(id, db))
    .filter((a): a is Asset => a !== undefined);

  const skipped = assets.filter((a) => hasRunningRun(a.id, db)).map((a) => a.id);
  const skippedSet = new Set(skipped);
  const startable = assets.filter((a) => !skippedSet.has(a.id));
  if (startable.length === 0) return { batchId: null, startedRunIds: [], skipped };

  const batch = createScanBatch(null, db);
  const servers = startable.filter((a) => a.type === "server");
  const repos = startable.filter((a) => a.type === "repo");

  const serverCreated = servers.map((asset) => createServerRun(asset.id, batch.id, db));
  const repoCreated = repos.map((asset) => ({ run: createRepoRun(asset, batch.id, db), asset }));

  const serverTasks = serverCreated.map(({ run, asset }) => async () => {
    await runServerScanPipeline(run, asset, deps, db);
  });
  const pipeline = deps?.runPipeline ?? runPipeline;
  const repoTasks = repoCreated.map(({ run, asset }) => async () => {
    await pipeline(
      run.id,
      {
        type: "git",
        repoUrl: asset.repoUrl!,
        ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
      },
      undefined,
      db,
    );
  });
  void Promise.all([
    runWithConcurrency(serverTasks, BULK_SCAN_CONCURRENCY),
    runWithConcurrency(repoTasks, repoScanConcurrency()),
  ]);

  return {
    batchId: batch.id,
    startedRunIds: [...serverCreated.map(({ run }) => run.id), ...repoCreated.map(({ run }) => run.id)],
    skipped,
  };
}
