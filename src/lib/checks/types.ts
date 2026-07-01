import type { CheckStatus } from "@/lib/catalog/types";

// Result of evaluating one catalog item against a specific run's evidence.
// Distinct from catalog.AutomationStatus (design-time: "is there a rule at
// all") — this is the runtime outcome of that rule for one run.
export interface CheckResult {
  id: string;
  status: CheckStatus;
  evidence: string;
}
