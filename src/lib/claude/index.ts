import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getCatalogItem } from "@/lib/catalog";
import type { CheckResult } from "@/lib/checks/types";
import { analyzeCheck } from "./analyze";
import { saveAnalysisReport } from "./store";

export { analyzeCheck } from "./analyze";
export { listAnalysisReports } from "./store";

// Analyzes every check result for a run and saves each report as it
// completes, so a failure partway through still leaves prior reports
// queryable (PRD: AI failure and check failure are independent).
export async function analyzeAndSaveChecks(
  runId: string,
  results: CheckResult[],
  db: Database = getDb(),
): Promise<void> {
  for (const result of results) {
    const item = getCatalogItem(result.id);
    if (!item) {
      throw new Error(`카탈로그에 없는 항목 id: ${result.id}`);
    }
    const report = await analyzeCheck({ item, result });
    saveAnalysisReport(runId, report, db);
  }
}
