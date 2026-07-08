import type { Category, CheckStatus, Severity } from "@/lib/catalog/types";

// Result of evaluating one catalog item against a specific run's evidence.
// Distinct from catalog.AutomationStatus (design-time: "is there a rule at
// all") — this is the runtime outcome of that rule for one run.
export interface CheckResult {
  id: string;
  status: CheckStatus;
  evidence: string;
}

export type CheckResultSource = "rule" | "ai";

// The shape GET /api/runs/[id] returns per check: a CheckResult joined with
// catalog metadata and (once Claude has run) its analysis report. Shared by
// every client view that renders a run's check list (RunStatus, ReportView).
export interface DecoratedCheckResult {
  id: string;
  status: CheckStatus;
  evidence: string;
  title: string;
  severity: Severity | null;
  category: Category | null;
  source: CheckResultSource;
  reason: string | null;
  remediation: string | null;
  example: string | null;
}
