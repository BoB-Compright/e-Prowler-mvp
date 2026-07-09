import type { Run } from "@/lib/pipeline/types";
import type { CheckResult } from "@/lib/checks/types";
import type { AnalysisReport } from "@/lib/claude/store";
import { getCatalogItem } from "@/lib/catalog";
import { CHECK_STATUS_LABELS } from "@/lib/catalog/types";
import { computeRiskSummary } from "@/lib/checks/riskSummary";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";

// Excel (and most spreadsheet apps) only render UTF-8 text correctly when a
// byte-order-mark precedes it; without it, Korean text shows up as mojibock
// when the file is double-clicked open. Must be the very first character.
const BOM = "﻿";
// RFC4180 line breaks -- keeps the file well-formed for Excel/Numbers even
// though the fields themselves may contain their own embedded "\n".
const CRLF = "\r\n";

// Quotes a single field per RFC4180: any field containing a comma, quote, or
// newline must be wrapped in quotes, with embedded quotes doubled.
function escapeCsvField(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(",");
}

// Pure, dependency-free function (other than the static catalog lookup) so
// it's directly unit-testable without a database -- the export API route is
// the only place that wires it up to real run/check-result/analysis-report
// data pulled from the DB.
export function buildReportCsv(run: Run, checks: CheckResult[], analyses: AnalysisReport[]): string {
  const analysesByItem = new Map(analyses.map((report) => [report.itemId, report]));

  const details = checks.map((check) => {
    const catalogItem = getCatalogItem(check.id);
    const analysis = analysesByItem.get(check.id);
    return {
      id: check.id,
      title: catalogItem?.title ?? analysis?.title ?? check.id,
      status: check.status,
      severity: catalogItem?.severity ?? "",
      reason: analysis?.reason ?? "",
      remediation: analysis?.remediation ?? "",
    };
  });

  const summary = computeRiskSummary(
    checks.map((check) => ({
      status: check.status,
      severity: getCatalogItem(check.id)?.severity ?? null,
    })),
  );

  const lines: string[] = [
    csvRow(["자산", getRepoDisplayName(run.repoUrl)]),
    csvRow(["점검 일시", run.updatedAt]),
    "",
    csvRow(["구분", "건수"]),
    csvRow(["전체", summary.total]),
    csvRow(["양호", summary.statusCounts.pass]),
    csvRow(["취약", summary.statusCounts.fail]),
    csvRow(["검토", summary.statusCounts.review]),
    "",
    csvRow(["항목 ID", "제목", "상태", "심각도", "사유", "조치"]),
    ...details.map((d) =>
      csvRow([d.id, d.title, CHECK_STATUS_LABELS[d.status], d.severity, d.reason, d.remediation]),
    ),
  ];

  return BOM + lines.join(CRLF);
}
