export type Category = "container" | "unix" | "web";

export type Severity = "Critical" | "High" | "Medium" | "Low";

// Whether this catalog item has an automated Ansible rule at all in MVP scope.
// Distinct from CheckStatus, which is the per-run outcome of that rule.
export type AutomationStatus = "automated" | "not_automated";

export interface CatalogItem {
  id: string;
  category: Category;
  title: string;
  severity: Severity;
  automationStatus: AutomationStatus;
}

// Internal per-run check outcome (PRD §4). Kept separate from the UI label
// so display copy can change without touching stored/compared values.
export type CheckStatus = "pass" | "fail" | "review" | "skip" | "not_automated";

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  pass: "양호",
  fail: "취약",
  review: "검토",
  skip: "제외/해당 없음",
  not_automated: "자동화 전",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  container: "컨테이너/이미지 하드닝",
  unix: "Unix 서버 (KISA 가이드 기반)",
  web: "웹서비스 (KISA 가이드 기반)",
};
