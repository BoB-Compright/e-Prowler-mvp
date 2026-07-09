import { NextRequest, NextResponse } from "next/server";
import {
  ProjectNotFoundError,
  ShareLinkRevokedError,
  regenerateShareLink,
  revokeShareLink,
  setShareLinkEnabled,
} from "@/lib/projects/store";

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

// Toggles (active <-> disabled) or permanently revokes a project's share link.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;

  try {
    if (action === "revoke") {
      return NextResponse.json(revokeShareLink(id));
    }
    if (action === "setEnabled" && typeof body?.enabled === "boolean") {
      return NextResponse.json(setShareLinkEnabled(id, body.enabled));
    }
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다" }, { status: 404 });
    }
    if (error instanceof ShareLinkRevokedError) {
      return NextResponse.json({ error: "폐기된 링크는 다시 활성화할 수 없습니다" }, { status: 409 });
    }
    throw error;
  }
}
