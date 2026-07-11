import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { AssetInUseError, deleteAsset, getAsset } from "@/lib/assets/store";

// 선택 자산 일괄 삭제. 실행 중 점검이 있는 자산(AssetInUseError)은 건너뛰고
// skipped로 보고한다 — 부분 실패를 조용히 삼키지 않는다.
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

  let deleted = 0;
  const skipped: string[] = [];
  for (const assetId of assetIds) {
    if (!getAsset(assetId)) continue;
    try {
      deleteAsset(assetId);
      deleted++;
    } catch (err) {
      if (err instanceof AssetInUseError) {
        skipped.push(assetId);
        continue;
      }
      throw err;
    }
  }
  return NextResponse.json({ deleted, skipped });
}
