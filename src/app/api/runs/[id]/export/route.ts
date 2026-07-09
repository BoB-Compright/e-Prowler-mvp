import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getRun } from "@/lib/pipeline/runs";
import type { Run } from "@/lib/pipeline/types";
import { listCheckResults } from "@/lib/checks/store";
import { listAnalysisReports } from "@/lib/claude";
import { getAsset } from "@/lib/assets/store";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import { buildReportCsv } from "@/lib/report/exportCsv";

// Characters that are unsafe/illegal in a filename on at least one common OS
// (Windows in particular) -- swapped for "_" so a stray "/" in an asset's
// display name can't be misread as a path separator by the browser either.
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

function buildExportFilename(run: Run): string {
  const assetName =
    (run.assetId && getAsset(run.assetId)?.displayName) || getRepoDisplayName(run.repoUrl);
  const timestamp = run.updatedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const safeAssetName = assetName.replace(UNSAFE_FILENAME_CHARS, "_");
  return `${safeAssetName}_${timestamp}.csv`;
}

// Report export (#74): download the completed run's report as CSV. Only
// succeeded runs are exportable -- a still-running run's checks are
// incomplete, and a failed run never produced a report to export at all
// (matches the report page itself, which only offers this button once
// run.status !== "running" and skips it whenever there's nothing to show).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.status !== "succeeded") {
    return NextResponse.json(
      { error: "완료된(succeeded) 점검만 보고서를 내보낼 수 있습니다" },
      { status: 400 },
    );
  }

  const checks = listCheckResults(id);
  const analyses = listAnalysisReports(id);
  const csv = buildReportCsv(run, checks, analyses);
  const filename = buildExportFilename(run);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
