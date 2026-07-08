import { NextRequest, NextResponse } from "next/server";
import { ProjectNotFoundError, regenerateShareLink } from "@/lib/projects/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const newPassword = typeof body?.password === "string" ? body.password : "";
  if (!newPassword) return NextResponse.json({ error: "password는 필수입니다" }, { status: 400 });
  try {
    return NextResponse.json(regenerateShareLink(id, newPassword));
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다" }, { status: 404 });
    }
    throw error;
  }
}
