import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getCatalogItem } from "@/lib/catalog";
import type { CheckResult } from "@/lib/checks/types";
import { analyzeCheck } from "./analyze";
import { saveAnalysisReport } from "./store";
import { applyVerdict } from "./verdict";
import { updateCheckVerdict } from "@/lib/checks/store";

export { analyzeCheck } from "./analyze";
export { listAnalysisReports } from "./store";

// Off by default: every check result is a separate real Anthropic API call,
// which burns real tokens on every dev/scan run. Set
// CLAUDE_ANALYSIS_ENABLED=true only when actually exercising Claude
// analysis (e.g. right before a demo/test), not for routine pipeline runs.
// Read lazily (not a module-load-time const) so tests can toggle it per-case.
function isClaudeAnalysisEnabled(): boolean {
  return process.env.CLAUDE_ANALYSIS_ENABLED === "true";
}

export interface AnalyzeDeps {
  analyze: typeof analyzeCheck;
}
const defaultDeps: AnalyzeDeps = { analyze: analyzeCheck };

// Analyzes every check result for a run and saves each report as it
// completes, so a failure partway through still leaves prior reports
// queryable (PRD: AI failure and check failure are independent).
export async function analyzeAndSaveChecks(
  runId: string,
  results: CheckResult[],
  db: Database = getDb(),
  deps: AnalyzeDeps = defaultDeps,
): Promise<void> {
  if (!isClaudeAnalysisEnabled()) return;

  for (const result of results) {
    const item = getCatalogItem(result.id);
    if (!item) {
      // A missing catalog id is a programming error (not a per-run AI
      // failure), so it stays outside the try/catch below and aborts the run.
      throw new Error(`카탈로그에 없는 항목 id: ${result.id}`);
    }
    try {
      const report = await deps.analyze({ item, result });
      saveAnalysisReport(runId, report, db);
      // review였던 항목만, AI verdict가 pass/fail이면 저장된 결과를 갱신한다.
      const applied = applyVerdict(result.status, report.verdict);
      if (applied.source === "ai") {
        updateCheckVerdict(runId, result.id, applied.status, db);
      }
    } catch (err) {
      // One item's AI failure (e.g. a Claude refusal) must not abort the
      // rest of the run -- skip this item, leaving its rule status intact,
      // and keep adjudicating the remaining review items.
      console.error(`[claude] analysis failed for ${result.id}, skipping:`, err);
    }
  }
}
