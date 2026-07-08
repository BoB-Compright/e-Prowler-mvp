import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { listRuns } from "@/lib/pipeline/runs";
import type { Run } from "@/lib/pipeline/types";

export function createScanBatch(projectId: string, db: Database = getDb()): { id: string } {
  const id = randomUUID();
  db.prepare(`INSERT INTO scan_batches (id, project_id, created_at) VALUES (?, ?, ?)`).run(
    id,
    projectId,
    new Date().toISOString(),
  );
  return { id };
}

export function listRunsByBatch(batchId: string, db: Database = getDb()): Run[] {
  return listRuns(db).filter((run) => run.batchId === batchId);
}
