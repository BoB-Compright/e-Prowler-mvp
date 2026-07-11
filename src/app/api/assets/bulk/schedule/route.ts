import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getAsset } from "@/lib/assets/store";
import { deleteScheduleForAsset, upsertSchedule } from "@/lib/scheduling/store";

const FREQUENCIES = ["daily", "weekly", "monthly"] as const;
type Frequency = (typeof FREQUENCIES)[number];

// 선택 자산에 동일한 정기 점검 규칙을 일괄 적용한다. frequency null은 해제.
// 요일/일자는 단순 기본값(월요일/1일, 02:00)을 쓴다 — 세밀한 조정은 자산
// 상세의 기존 스케줄 UI에서 한다.
export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const assetIds: string[] = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  const rawFrequency = body?.frequency ?? null;

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "자산을 하나 이상 선택하세요" }, { status: 400 });
  }
  const isNull = rawFrequency === null;
  if (!isNull && !FREQUENCIES.includes(rawFrequency)) {
    return NextResponse.json({ error: "frequency는 daily/weekly/monthly/null 중 하나여야 합니다" }, { status: 400 });
  }

  let updated = 0;
  for (const assetId of assetIds) {
    if (!getAsset(assetId)) continue;
    if (isNull) {
      deleteScheduleForAsset(assetId);
    } else {
      const frequency = rawFrequency as Frequency;
      upsertSchedule(assetId, {
        frequency,
        dayOfWeek: frequency === "weekly" ? 1 : null,
        dayOfMonth: frequency === "monthly" ? 1 : null,
        timeOfDay: "02:00",
        enabled: true,
      });
    }
    updated++;
  }
  return NextResponse.json({ updated });
}
