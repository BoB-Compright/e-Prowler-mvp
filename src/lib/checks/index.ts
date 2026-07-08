import { analyzeDockerfile } from "./dockerfileChecks";
import { runAnsibleChecks } from "./ansibleRunner";
import { evaluateAllChecks, detectAssetProfile } from "./ruleEvaluation";
import { getCatalogItem } from "@/lib/catalog";
import type { CheckResult } from "./types";

export type { CheckResult } from "./types";

// Combines Dockerfile static analysis with Ansible runtime evidence into
// normalized pass/fail/skip results for every automated catalog item.
// dockerfilePath is undefined for the local-image fallback path (#41), where
// there is no source repo to read a Dockerfile from — Dockerfile-only checks
// evaluate to "skip" in that case (see evaluateAllChecks).
export async function runAllChecks(
  dockerfilePath: string | undefined,
  containerName: string,
): Promise<CheckResult[]> {
  const findings = dockerfilePath ? analyzeDockerfile(dockerfilePath) : null;
  const tasks = await runAnsibleChecks(containerName);

  // evaluateAllChecks still computes every item (cheap, in-memory JS — the
  // expensive step is the ansible run above, which already happened once
  // regardless). Scoping happens here, by dropping items whose catalog
  // `appliesTo` isn't satisfied by what was actually detected on this asset,
  // so a run's stored/displayed results only ever include checks relevant
  // to its actual stack instead of a "skip" row for every irrelevant one.
  const profile = detectAssetProfile(tasks);
  return evaluateAllChecks(findings, tasks).filter((result) => {
    const appliesTo = getCatalogItem(result.id)?.appliesTo;
    if (!appliesTo || appliesTo.length === 0) return true;
    return appliesTo.some((tech) => profile.has(tech));
  });
}
