import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getAiAnalysisEnabled, setAiAnalysisEnabled } from "@/lib/settings/store";

// 현재 AI 분석 토글 상태를 반환한다.
export async function GET(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ enabled: getAiAnalysisEnabled() });
}

// AI 분석 토글을 켜거나 끈다. env(CLAUDE_ANALYSIS_ENABLED)로 강제-ON된 경우에도
// 이 값과 무관하게 게이트가 통과되지만, 프로덕션에선 env가 없으므로 이 토글이 유일한 제어다.
export async function PUT(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled는 boolean이어야 합니다" }, { status: 400 });
  }
  setAiAnalysisEnabled(body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
