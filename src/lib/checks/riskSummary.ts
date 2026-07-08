import type { CheckStatus, Severity } from "@/lib/catalog/types";

const STATUSES: CheckStatus[] = ["pass", "fail", "review", "skip", "not_automated"];
const SEVERITIES: Severity[] = ["Critical", "High", "Medium", "Low"];

export interface RiskSummaryInput {
  status: CheckStatus;
  severity: Severity | null;
}

export interface RiskSummary {
  total: number;
  statusCounts: Record<CheckStatus, number>;
  // Severity is only meaningful for confirmed vulnerabilities, so this counts
  // "fail" items by severity (PRD §4: skip isn't a failure, review isn't
  // scored as a vulnerability yet).
  severityCounts: Record<Severity, number>;
}

export type RunOutcome = "fail" | "review" | "pass";

// Pure, dependency-free logic — safe to import from client components (e.g.
// RunStatus.tsx). DB-backed lookups live in ./riskSummaryStore instead, so
// that file (and its better-sqlite3 import chain) never ends up in a browser
// bundle.
export function computeRiskSummary(checks: RiskSummaryInput[]): RiskSummary {
  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
    CheckStatus,
    number
  >;
  const severityCounts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<
    Severity,
    number
  >;

  for (const check of checks) {
    statusCounts[check.status] += 1;
    if (check.status === "fail" && check.severity) {
      severityCounts[check.severity] += 1;
    }
  }

  return { total: checks.length, statusCounts, severityCounts };
}

// Worst-first: any confirmed vulnerability outranks any item merely needing
// review, which outranks a clean run.
export function overallRunOutcome(summary: RiskSummary): RunOutcome {
  if (summary.statusCounts.fail > 0) return "fail";
  if (summary.statusCounts.review > 0) return "review";
  return "pass";
}
