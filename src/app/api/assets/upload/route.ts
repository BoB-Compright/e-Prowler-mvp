import { NextRequest, NextResponse } from "next/server";
import { importAssetsFromWorkbook } from "@/lib/assets/excelImport";
import { requireApiSession } from "@/lib/auth/requireSession";

export async function POST(req: NextRequest) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다" }, { status: 400 });
  }
  const projectIdField = formData?.get("projectId");
  const projectId = typeof projectIdField === "string" && projectIdField ? projectIdField : null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = importAssetsFromWorkbook(buffer, projectId);
  return NextResponse.json(result);
}
