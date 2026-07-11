export type ScoreGrade = "safe" | "caution" | "warning" | "danger";

export interface SecurityScoreInput {
  totalAssets: number;
  vulnerableAssets: number; // 최근 점검 결과가 "취약"인 자산 수
  uncheckedAssets: number; // 점검 이력이 없는(none) 자산 수
  criticalHighCheckFindings: number; // 최근 점검들의 Critical+High fail 항목 합
  criticalHighOpenCves: number; // 미해제 Critical/High CVE 수
}

export interface SecurityScore {
  score: number; // 0~100 정수
  grade: ScoreGrade;
}

export function gradeOf(score: number): ScoreGrade {
  if (score >= 90) return "safe";
  if (score >= 70) return "caution";
  if (score >= 40) return "warning";
  return "danger";
}

// 산정식은 설계 문서(2026-07-11-dashboard-visibility-design.md) §종합 보안 점수 그대로:
// 100에서 감점 — 취약 자산 비율×40, C/H 점검 항목×2(상한 30), C/H CVE×3(상한 30),
// 미점검 비율×10. 하한 0.
export function computeSecurityScore(input: SecurityScoreInput): SecurityScore {
  if (input.totalAssets <= 0) return { score: 100, grade: "safe" };
  const vulnPenalty = (input.vulnerableAssets / input.totalAssets) * 40;
  const findingPenalty = Math.min(30, input.criticalHighCheckFindings * 2);
  const cvePenalty = Math.min(30, input.criticalHighOpenCves * 3);
  const coveragePenalty = (input.uncheckedAssets / input.totalAssets) * 10;
  const score = Math.max(0, Math.round(100 - vulnPenalty - findingPenalty - cvePenalty - coveragePenalty));
  return { score, grade: gradeOf(score) };
}
