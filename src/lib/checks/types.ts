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

// listCheckResults's return shape: a CheckResult plus the compliance
// framework it was persisted against (persisted at save time; falls back to
// a live catalog lookup for legacy rows saved before framework_id existed).
// Kept separate from CheckResult so that type stays the minimal shape rule
// evaluation/AI analysis produce.
export interface StoredCheckResult extends CheckResult {
  frameworkId?: string;
  source: CheckResultSource;
}

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
  frameworkId: string | null;
  // "rule"|"ai": whether an AI analysis report exists for this check yet.
  // Distinct from frameworkId/sourceRef below, which identify the compliance
  // framework (e.g. KISA/CIS) the item itself belongs to -- do not conflate
  // the two "source" concepts.
  source: CheckResultSource;
  sourceRef: string | null;
  reason: string | null;
  remediation: string | null;
  example: string | null;
}
