import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { CheckStatus } from "@/lib/catalog/types";
import type { CheckResult } from "./types";

interface CheckResultRow {
  id: number;
  run_id: string;
  item_id: string;
  status: CheckStatus;
  evidence: string;
  created_at: string;
}

export function saveCheckResults(
  runId: string,
  results: CheckResult[],
  db: Database = getDb(),
): void {
  const insert = db.prepare(
    `INSERT INTO check_results (run_id, item_id, status, evidence, created_at)
     VALUES (@runId, @itemId, @status, @evidence, @createdAt)`,
  );
  const now = new Date().toISOString();
  const insertMany = db.transaction((rows: CheckResult[]) => {
    for (const row of rows) {
      insert.run({ runId, itemId: row.id, status: row.status, evidence: row.evidence, createdAt: now });
    }
  });
  insertMany(results);
}

export function listCheckResults(runId: string, db: Database = getDb()): CheckResult[] {
  const rows = db
    .prepare(`SELECT * FROM check_results WHERE run_id = ? ORDER BY id ASC`)
    .all(runId) as CheckResultRow[];
  return rows.map((row) => ({ id: row.item_id, status: row.status, evidence: row.evidence }));
}
