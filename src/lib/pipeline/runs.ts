import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import type { Run, RunEvent, RunSourceType, RunStatus, RunTriggerType, Stage } from "./types";

interface RunRow {
  id: string;
  repo_url: string;
  source_type: RunSourceType;
  stage: Stage;
  status: RunStatus;
  image_tag: string | null;
  container_name: string | null;
  error_message: string | null;
  asset_id: string | null;
  batch_id: string | null;
  trigger_type: RunTriggerType;
  created_at: string;
  updated_at: string;
}

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    repoUrl: row.repo_url,
    sourceType: row.source_type,
    stage: row.stage,
    status: row.status,
    imageTag: row.image_tag,
    containerName: row.container_name,
    errorMessage: row.error_message,
    assetId: row.asset_id,
    batchId: row.batch_id,
    triggerType: row.trigger_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// `source` is a git URL for sourceType "git", or an already-built local image
// tag (e.g. "nginx:latest") for sourceType "local_image" — the fallback path
// (#41) that re-scans an existing image when clone/build is unavailable.
export function createRun(
  source: string,
  sourceType: RunSourceType = "git",
  assetId: string | null = null,
  db: Database = getDb(),
): Run {
  const now = new Date().toISOString();
  const run: Run = {
    id: randomUUID(),
    repoUrl: source,
    sourceType,
    stage: "clone",
    status: "running",
    imageTag: null,
    containerName: null,
    errorMessage: null,
    assetId,
    batchId: null,
    triggerType: "manual",
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO runs (id, repo_url, source_type, stage, status, image_tag, container_name, error_message, asset_id, created_at, updated_at)
     VALUES (@id, @repoUrl, @sourceType, @stage, @status, @imageTag, @containerName, @errorMessage, @assetId, @createdAt, @updatedAt)`,
  ).run(run);
  appendEvent(run.id, run.stage, run.status, null, db);
  return run;
}

export function updateRunStage(
  runId: string,
  stage: Stage,
  status: RunStatus,
  extra: {
    imageTag?: string;
    containerName?: string;
    errorMessage?: string;
    message?: string;
  } = {},
  db: Database = getDb(),
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE runs SET stage = @stage, status = @status, updated_at = @updatedAt
     ${extra.imageTag !== undefined ? ", image_tag = @imageTag" : ""}
     ${extra.containerName !== undefined ? ", container_name = @containerName" : ""}
     ${extra.errorMessage !== undefined ? ", error_message = @errorMessage" : ""}
     WHERE id = @id`,
  ).run({
    id: runId,
    stage,
    status,
    updatedAt: now,
    imageTag: extra.imageTag,
    containerName: extra.containerName,
    errorMessage: extra.errorMessage,
  });
  appendEvent(runId, stage, status, extra.message ?? extra.errorMessage ?? null, db);
}

export function appendEvent(
  runId: string,
  stage: Stage,
  status: RunStatus,
  message: string | null,
  db: Database = getDb(),
): void {
  db.prepare(
    `INSERT INTO run_events (run_id, stage, status, message, created_at)
     VALUES (@runId, @stage, @status, @message, @createdAt)`,
  ).run({ runId, stage, status, message, createdAt: new Date().toISOString() });
}

export function getRun(runId: string, db: Database = getDb()): Run | undefined {
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | undefined;
  return row ? toRun(row) : undefined;
}

export function listRuns(db: Database = getDb()): Run[] {
  const rows = db.prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all() as RunRow[];
  return rows.map(toRun);
}

export function listRunEvents(runId: string, db: Database = getDb()): RunEvent[] {
  const rows = db
    .prepare(`SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC`)
    .all(runId) as {
    id: number;
    run_id: string;
    stage: Stage;
    status: RunStatus;
    message: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    stage: row.stage,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  }));
}

// Marks a run cancelled without changing its current stage (unlike
// updateRunStage, which always writes both). The pipeline itself never calls
// this — it's the write side of the cancel API (#73); the read side is
// isCancelled, which orchestrator.ts/serverScan.ts poll at each stage
// boundary so an in-flight run notices the cancellation instead of
// clobbering it back to "succeeded"/"failed" once its current awaited step
// resolves.
export function cancelRun(runId: string, message: string, db: Database = getDb()): Run {
  const run = getRun(runId, db);
  if (!run) {
    throw new Error(`run not found: ${runId}`);
  }
  const now = new Date().toISOString();
  db.prepare(`UPDATE runs SET status = 'cancelled', updated_at = @updatedAt WHERE id = @id`).run({
    id: runId,
    updatedAt: now,
  });
  appendEvent(runId, run.stage, "cancelled", message, db);
  return getRun(runId, db)!;
}

export function isCancelled(runId: string, db: Database = getDb()): boolean {
  return getRun(runId, db)?.status === "cancelled";
}

export function markRunTriggerType(
  runId: string,
  triggerType: RunTriggerType,
  db: Database = getDb(),
): void {
  db.prepare(`UPDATE runs SET trigger_type = ? WHERE id = ?`).run(triggerType, runId);
}
