import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getRun, listRunEvents } from "@/lib/pipeline/runs";
import { listCheckResults } from "@/lib/checks/store";
import type { DecoratedCheckResult } from "@/lib/checks/types";
import { listAnalysisReports } from "@/lib/claude";
import { getCatalogItem } from "@/lib/catalog";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const reportsByItem = new Map(
    listAnalysisReports(id).map((report) => [report.itemId, report]),
  );

  const checks: DecoratedCheckResult[] = listCheckResults(id).map((result) => {
    const report = reportsByItem.get(result.id);
    const catalogItem = getCatalogItem(result.id);
    return {
      ...result,
      title: catalogItem?.title ?? result.id,
      severity: catalogItem?.severity ?? null,
      category: catalogItem?.category ?? null,
      frameworkId: result.frameworkId ?? catalogItem?.frameworkId ?? null,
      // "ai" once Claude has analyzed this item (every item goes through
      // Claude in this pipeline), "rule" while only rule_eval has run so far.
      source: report ? "ai" : "rule",
      sourceRef: catalogItem?.source.ref ?? null,
      reason: report?.reason ?? null,
      remediation: report?.remediation ?? null,
      example: report?.example ?? null,
    };
  });

  return NextResponse.json({ run, events: listRunEvents(id), checks });
}
