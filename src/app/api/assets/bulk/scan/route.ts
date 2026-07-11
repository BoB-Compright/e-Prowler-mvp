import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { startAssetsBulkScan } from "@/lib/pipeline/bulkScan";

// 선택한 자산들로 일괄 점검 배치를 시작한다. run 행은 동기 생성되므로
// 클라이언트는 응답의 batchId로 즉시 배치 페이지로 이동할 수 있다
// (fire-and-forget — 프로젝트 fleet 스캔 라우트와 같은 패턴).
export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const assetIds: string[] = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  if (assetIds.length === 0) {
    return NextResponse.json({ error: "자산을 하나 이상 선택하세요" }, { status: 400 });
  }

  const result = startAssetsBulkScan(assetIds);
  if (result.batchId === null) {
    return NextResponse.json(
      { error: "선택한 자산이 모두 점검 중이거나 존재하지 않습니다", skipped: result.skipped },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { batchId: result.batchId, started: result.startedRunIds.length, skipped: result.skipped },
    { status: 202 },
  );
}
