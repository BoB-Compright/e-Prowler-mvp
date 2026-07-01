import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import type { Run, RunEvent, RunStatus, Stage } from "./types";

interface RunRow {
  id: string;
  repo_url: string;
  stage: Stage;
  status: RunStatus;
  image_tag: string | null;
  container_name: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    repoUrl: row.repo_url,
    stage: row.stage,
    status: row.status,
    imageTag: row.image_tag,
    containerName: row.container_name,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRun(repoUrl: string, db: Database = getDb()): Run {
  const now = new Date().toISOString();
  const run: Run = {
    id: randomUUID(),
    repoUrl,
    stage: "clone",
    status: "running",
    imageTag: null,
    containerName: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO runs (id, repo_url, stage, status, image_tag, container_name, error_message, created_at, updated_at)
     VALUES (@id, @repoUrl, @stage, @status, @imageTag, @containerName, @errorMessage, @createdAt, @updatedAt)`,
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
