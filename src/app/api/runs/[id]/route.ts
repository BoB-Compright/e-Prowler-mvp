import { NextResponse } from "next/server";
import { getRun, listRunEvents } from "@/lib/pipeline/runs";
import { listCheckResults } from "@/lib/checks/store";
import { listAnalysisReports } from "@/lib/claude";
import { getCatalogItem } from "@/lib/catalog";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const reportsByItem = new Map(
    listAnalysisReports(id).map((report) => [report.itemId, report]),
  );

  const checks = listCheckResults(id).map((result) => {
    const report = reportsByItem.get(result.id);
    return {
      ...result,
      title: getCatalogItem(result.id)?.title ?? result.id,
      severity: getCatalogItem(result.id)?.severity ?? null,
      reason: report?.reason ?? null,
      remediation: report?.remediation ?? null,
      example: report?.example ?? null,
    };
  });

  return NextResponse.json({ run, events: listRunEvents(id), checks });
}
