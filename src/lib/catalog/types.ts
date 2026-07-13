export type Category = "container" | "unix" | "web" | "was" | "db" | "windows";

export type Severity = "Critical" | "High" | "Medium" | "Low";

// Whether this catalog item has an automated Ansible rule at all in MVP scope.
// Distinct from CheckStatus, which is the per-run outcome of that rule.
export type AutomationStatus = "automated" | "not_automated";

export interface Framework {
  id: string;
  name: string;
  docVersion?: string;
}

// A specific software product this item's automated check targets, detected
// at runtime from the scanned container (see detectAssetProfile in
// src/lib/checks/ruleEvaluation.ts). Only meaningful when automationStatus
// is "automated" and the check's evidence-gathering is genuinely tied to one
// product family (e.g. nginx-only config parsing, or a shared "mail service
// detection" task feeding several U-items) -- most C-*/U-* items apply to
// any Linux container regardless of installed software and leave this unset.
export type Technology = "nginx" | "mail" | "dns" | "ftp" | "snmp";

export interface CatalogItem {
  id: string;
  category: Category;
  frameworkId: string;
  title: string;
  severity: Severity;
  automationStatus: AutomationStatus;
  // Undefined/omitted = applies to any asset, no stack-based scoping.
  appliesTo?: Technology[];
  source: { framework: string; ref: string };
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
  was: "WAS (CIS 기반)",
  db: "DB (CIS 기반)",
  windows: "Windows 서버 (CIS 기반)",
};

// 취약(fail)·검토(review) 항목의 정적 조치 가이드. AI·점검시점과 무관하게 항상 제공.
export interface Mitigation {
  risk: string; // 이 취약점이 왜 위험한가 (1~2문장)
  fix: string; // 조치 방법 (설명/단계)
  example?: string; // 설정·명령 예시 (코드블록으로 렌더)
}
