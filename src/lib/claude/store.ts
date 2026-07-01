import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { ClaudeAnalysis } from "./schema";

interface AnalysisReportRow {
  item_id: string;
  title: string;
  reason: string;
  remediation: string;
  example: string;
}

export function saveAnalysisReport(
  runId: string,
  report: ClaudeAnalysis,
  db: Database = getDb(),
): void {
  db.prepare(
    `INSERT INTO analysis_reports (run_id, item_id, title, reason, remediation, example, created_at)
     VALUES (@runId, @itemId, @title, @reason, @remediation, @example, @createdAt)`,
  ).run({
    runId,
    itemId: report.id,
    title: report.title,
    reason: report.reason,
    remediation: report.remediation,
    example: report.example,
    createdAt: new Date().toISOString(),
  });
}

export interface AnalysisReport {
  itemId: string;
  title: string;
  reason: string;
  remediation: string;
  example: string;
}

export function listAnalysisReports(runId: string, db: Database = getDb()): AnalysisReport[] {
  const rows = db
    .prepare(
      `SELECT item_id, title, reason, remediation, example FROM analysis_reports WHERE run_id = ? ORDER BY id ASC`,
    )
    .all(runId) as AnalysisReportRow[];
  return rows.map((row) => ({
    itemId: row.item_id,
    title: row.title,
    reason: row.reason,
    remediation: row.remediation,
    example: row.example,
  }));
}
