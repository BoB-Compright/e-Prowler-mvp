import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { listCheckResults } from "./store";
import type { DecoratedCheckResult } from "./types";
import { listAnalysisReports } from "@/lib/claude";
import { getCatalogItem, getMitigation } from "@/lib/catalog";

// run의 저장된 점검 결과를 카탈로그 메타·분석 리포트·조치 가이드로 데코한다.
// (관리자 리포트 API와 공유 리포트 API가 공유하는 단일 소스.)
export function getDecoratedResults(runId: string, db: Database = getDb()): DecoratedCheckResult[] {
  const reportsByItem = new Map(
    listAnalysisReports(runId, db).map((report) => [report.itemId, report]),
  );
  return listCheckResults(runId, db).map((result) => {
    const report = reportsByItem.get(result.id);
    const catalogItem = getCatalogItem(result.id);
    return {
      ...result,
      title: catalogItem?.title ?? result.id,
      severity: catalogItem?.severity ?? null,
      category: catalogItem?.category ?? null,
      frameworkId: result.frameworkId ?? catalogItem?.frameworkId ?? null,
      // Stored verdict provenance (check_results.source): "ai" once an AI
      // adjudication has updated this item's status, "rule" while only
      // rule_eval has decided it. This is independent of whether an
      // analysis report exists — reason/remediation/example below still
      // come from the report when present.
      source: result.source,
      sourceRef: catalogItem?.source.ref ?? null,
      reason: report?.reason ?? null,
      remediation: report?.remediation ?? null,
      example: report?.example ?? null,
      mitigation: getMitigation(result.id),
    };
  });
}
