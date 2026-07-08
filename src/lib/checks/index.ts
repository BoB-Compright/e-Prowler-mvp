import { analyzeDockerfile } from "./dockerfileChecks";
import { runAnsibleChecks } from "./ansibleRunner";
import { evaluateAllChecks } from "./ruleEvaluation";
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
  return evaluateAllChecks(findings, tasks);
}
