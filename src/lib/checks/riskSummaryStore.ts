import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getCatalogItem } from "@/lib/catalog";
import { computeRiskSummary, type RiskSummary } from "./riskSummary";
import { listCheckResults } from "./store";

export function getRunRiskSummary(runId: string, db: Database = getDb()): RiskSummary {
  const inputs = listCheckResults(runId, db).map((result) => ({
    status: result.status,
    severity: getCatalogItem(result.id)?.severity ?? null,
  }));
  return computeRiskSummary(inputs);
}
