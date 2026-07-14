import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getRun, listRunEvents } from "@/lib/pipeline/runs";
import { getDecoratedResults } from "@/lib/checks/decorate";
import { listCveMatches } from "@/lib/cve/store";

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

  const checks = getDecoratedResults(id);

  const cveMatches = run.sourceType === "server" && run.assetId ? listCveMatches(run.assetId) : [];

  return NextResponse.json({ run, events: listRunEvents(id), checks, cveMatches });
}
