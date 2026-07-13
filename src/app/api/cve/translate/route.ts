import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { translateCveSummaries } from "@/lib/cve/translate";

export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const items = body?.items;
  if (
    !Array.isArray(items) ||
    !items.every((i) => i && typeof i.cveId === "string" && typeof i.summary === "string")
  ) {
    return NextResponse.json({ error: "items는 {cveId,summary}[] 이어야 합니다" }, { status: 400 });
  }

  const map = await translateCveSummaries(items);
  return NextResponse.json({ translations: Object.fromEntries(map) });
}
