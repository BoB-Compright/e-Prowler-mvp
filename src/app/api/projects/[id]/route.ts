import { NextRequest, NextResponse } from "next/server";
import { ProjectNotFoundError, deleteProject, getProject, updateProject } from "@/lib/projects/store";
import { requireApiSession } from "@/lib/auth/requireSession";
import { listAssets } from "@/lib/assets/store";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
  return NextResponse.json({ project, assets: listAssets({ projectId: id }) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    const project = updateProject(id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      pmName: typeof body?.pmName === "string" ? body.pmName : undefined,
      pmEmail: typeof body?.pmEmail === "string" ? body.pmEmail : undefined,
    });
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  deleteProject(id);
  return NextResponse.json({ ok: true });
}
