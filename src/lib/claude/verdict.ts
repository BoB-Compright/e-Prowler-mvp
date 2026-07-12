import type { CheckStatus } from "@/lib/catalog/types";

// 선택 모델 안전장치: AI는 룰이 "review"로 보류한 항목만 판정할 수 있고,
// 그 경우에도 pass/fail만 채택한다. 룰이 낸 pass/fail/skip은 어떤 AI verdict가
// 와도 그대로 유지된다(프롬프트가 아니라 코드로 강제).
export function applyVerdict(
  ruleStatus: CheckStatus,
  verdict: CheckStatus,
): { status: CheckStatus; source: "rule" | "ai" } {
  if (ruleStatus === "review" && (verdict === "pass" || verdict === "fail")) {
    return { status: verdict, source: "ai" };
  }
  return { status: ruleStatus, source: "rule" };
}
