export type Category = "container" | "unix" | "web";

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
