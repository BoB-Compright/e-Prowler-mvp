import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { runDeltaCycle } from "@/lib/cve/deltaWatcher";

// 동시에 두 번 돌지 않도록 모듈 수준 가드(폴러/워처와 별개의 수동 트리거).
let scanInFlight = false;

export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  if (scanInFlight) {
    return NextResponse.json({ error: "이미 스캔이 진행 중입니다" }, { status: 409 });
  }
  scanInFlight = true;
  try {
    await runDeltaCycle(new Date());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "스캔 실패" },
      { status: 500 },
    );
  } finally {
    scanInFlight = false;
  }
}
