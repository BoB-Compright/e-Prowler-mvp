import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getCatalog, getCatalogSummary, getFrameworks } from "@/lib/catalog";

export function GET(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    summary: getCatalogSummary(),
    items: getCatalog(),
    frameworks: getFrameworks(),
  });
}
