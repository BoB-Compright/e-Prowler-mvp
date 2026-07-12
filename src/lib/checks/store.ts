import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getCatalogItem } from "@/lib/catalog";
import type { CheckStatus } from "@/lib/catalog/types";
import type { CheckResult, StoredCheckResult } from "./types";

interface CheckResultRow {
  id: number;
  run_id: string;
  item_id: string;
  status: CheckStatus;
  evidence: string;
  framework_id: string | null;
  source: "rule" | "ai";
  created_at: string;
}

export function saveCheckResults(
  runId: string,
  results: CheckResult[],
  db: Database = getDb(),
): void {
  const insert = db.prepare(
    `INSERT INTO check_results (run_id, item_id, status, evidence, framework_id, created_at)
     VALUES (@runId, @itemId, @status, @evidence, @frameworkId, @createdAt)`,
  );
  const now = new Date().toISOString();
  const insertMany = db.transaction((rows: CheckResult[]) => {
    for (const row of rows) {
      insert.run({
        runId,
        itemId: row.id,
        status: row.status,
        evidence: row.evidence,
        frameworkId: getCatalogItem(row.id)?.frameworkId ?? null,
        createdAt: now,
      });
    }
  });
  insertMany(results);
}

export function listCheckResults(runId: string, db: Database = getDb()): StoredCheckResult[] {
  const rows = db
    .prepare(`SELECT * FROM check_results WHERE run_id = ? ORDER BY id ASC`)
    .all(runId) as CheckResultRow[];
  return rows.map((row) => ({
    id: row.item_id,
    status: row.status,
    evidence: row.evidence,
    // Legacy rows saved before framework_id existed have it as null -- fall
    // back to a live catalog lookup so older runs still surface a framework.
    frameworkId: row.framework_id ?? getCatalogItem(row.item_id)?.frameworkId,
    source: row.source ?? "rule",
  }));
}

export function updateCheckVerdict(
  runId: string,
  itemId: string,
  status: CheckStatus,
  db: Database = getDb(),
): void {
  // Defense in depth: even if a caller mistakenly invokes this for an
  // already-decided (non-review) item, the storage layer itself refuses to
  // overwrite it -- only a rule verdict of "review" may be adjudicated by AI.
  db.prepare(
    `UPDATE check_results SET status = @status, source = 'ai' WHERE run_id = @runId AND item_id = @itemId AND status = 'review'`,
  ).run({ status, runId, itemId });
}
