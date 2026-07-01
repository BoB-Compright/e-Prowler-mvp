import { NextResponse } from "next/server";
import { getCatalog, getCatalogSummary } from "@/lib/catalog";

export function GET() {
  return NextResponse.json({
    summary: getCatalogSummary(),
    items: getCatalog(),
  });
}
