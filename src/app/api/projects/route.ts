import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects/store";
import { requireApiSession } from "@/lib/auth/requireSession";

export function GET(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json({ projects: listProjects() });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const pmName = typeof body?.pmName === "string" ? body.pmName.trim() : "";
  const pmEmail = typeof body?.pmEmail === "string" ? body.pmEmail.trim() : "";
  const sharePassword = typeof body?.sharePassword === "string" ? body.sharePassword : "";
  if (!name || !pmName || !pmEmail || !sharePassword) {
    return NextResponse.json({ error: "name, pmName, pmEmail, sharePassword는 필수입니다" }, { status: 400 });
  }
  const project = createProject({ name, pmName, pmEmail, sharePassword });
  return NextResponse.json({ project }, { status: 201 });
}
