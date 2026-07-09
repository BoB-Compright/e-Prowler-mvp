import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects/store";
import { requireApiSession } from "@/lib/auth/requireSession";
import { startProjectFleetScan } from "@/lib/pipeline/serverScan";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다" }, { status: 404 });
  }

  // Fire-and-forget: run rows are created synchronously so the client can
  // navigate to the batch page immediately, while the fleet scans in the
  // background (same pattern as the single-run POST /api/runs route).
  const result = startProjectFleetScan(id);
  return NextResponse.json(result, { status: 202 });
}
