import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { setAssetsProject } from "@/lib/assets/store";
import { getProject } from "@/lib/projects/store";

export async function PATCH(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const assetIds: string[] = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  const projectId: string | null = typeof body?.projectId === "string" ? body.projectId : null;

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "자산을 하나 이상 선택하세요" }, { status: 400 });
  }
  if (projectId !== null && !getProject(projectId)) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다" }, { status: 400 });
  }

  const updated = setAssetsProject(assetIds, projectId);
  return NextResponse.json({ updated });
}
