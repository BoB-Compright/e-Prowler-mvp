import { analyzeDockerfile } from "./dockerfileChecks";
import { runAnsibleChecks } from "./ansibleRunner";
import { evaluateAllChecks } from "./ruleEvaluation";
import type { CheckResult } from "./types";

export type { CheckResult } from "./types";

// Combines Dockerfile static analysis with Ansible runtime evidence into
// normalized pass/fail/skip results for every automated catalog item.
export async function runAllChecks(
  dockerfilePath: string,
  containerName: string,
): Promise<CheckResult[]> {
  const findings = analyzeDockerfile(dockerfilePath);
  const tasks = await runAnsibleChecks(containerName);
  return evaluateAllChecks(findings, tasks);
}
