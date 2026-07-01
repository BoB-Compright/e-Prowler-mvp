import { analyzeDockerfile } from "./dockerfileChecks";
import { runAnsibleChecks } from "./ansibleRunner";
import { evaluateFirstWaveChecks } from "./ruleEvaluation";
import type { CheckResult } from "./types";

export type { CheckResult } from "./types";

// The full "1차 자동화 대상" slice (PRD §5.2): C-01, C-02, U-16. Combines
// Dockerfile static analysis with Ansible runtime evidence into normalized
// pass/fail/skip results.
export async function runFirstWaveChecks(
  dockerfilePath: string,
  containerName: string,
): Promise<CheckResult[]> {
  const findings = analyzeDockerfile(dockerfilePath);
  const tasks = await runAnsibleChecks(containerName);
  return evaluateFirstWaveChecks(findings, tasks);
}
