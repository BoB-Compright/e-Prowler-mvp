import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { listRecentMatchedCves } from "@/lib/cve/store";

const TOAST_LIMIT = 10;

export async function GET(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const since = new URL(req.url).searchParams.get("since") ?? new Date().toISOString();
  const matches = listRecentMatchedCves(since, TOAST_LIMIT);
  return NextResponse.json({ matches });
}
