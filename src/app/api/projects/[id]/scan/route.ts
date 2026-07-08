import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects/store";
import { scanProjectFleet } from "@/lib/pipeline/serverScan";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다" }, { status: 404 });
  }

  const result = await scanProjectFleet(id);
  return NextResponse.json(result, { status: 202 });
}
