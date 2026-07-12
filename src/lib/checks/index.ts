import { analyzeDockerfile } from "./dockerfileChecks";
import { runAnsibleChecks } from "./ansibleRunner";
import { evaluateAllChecks, detectAssetProfile } from "./ruleEvaluation";
import { getCatalogItem } from "@/lib/catalog";
import { resolveCheckPlan, evaluatePlan } from "@/lib/packs/resolve";
import { webNginxPack } from "@/lib/packs/webNginx";
import type { Asset } from "@/lib/assets/types";
import type { CheckResult } from "./types";

export type { CheckResult } from "./types";

// Combines Dockerfile static analysis with Ansible runtime evidence into
// normalized pass/fail/skip results for every automated catalog item.
// dockerfilePath is undefined for the local-image fallback path (#41), where
// there is no source repo to read a Dockerfile from — Dockerfile-only checks
// evaluate to "skip" in that case (see evaluateAllChecks).
//
// asset is optional: when present, evidence and evaluation are scoped to the
// vendor pack plan resolved for that asset (resolveCheckPlan/evaluatePlan) —
// only the composed base+vendor evidence tasks run, and only that plan's
// items are evaluated. When absent (e.g. the local-image re-scan fallback,
// which has no associated asset row), this falls back to the original
// full-catalog path: run every base evidence task and evaluate every
// catalog item, then scope the *result* down to the asset's detected stack
// (dropping items whose catalog `appliesTo` isn't satisfied) so a run's
// stored/displayed results don't include a "skip" row for every irrelevant
// item.
export async function runAllChecks(
  dockerfilePath: string | undefined,
  containerName: string,
  asset?: Asset,
): Promise<CheckResult[]> {
  const findings = dockerfilePath ? analyzeDockerfile(dockerfilePath) : null;

  if (asset) {
    const plan = resolveCheckPlan(asset);
    const tasks = await runAnsibleChecks(containerName, plan.evidenceTasks);
    return evaluatePlan(plan, { findings, tasks }, asset);
  }

  // 하위호환: asset 없이 호출되면(로컬 이미지 재점검 등) 기존 전체 평가 경로를 유지한다.
  // nginx 증거 태스크는 base security-checks.yml에서 web-nginx 팩으로 이관됐으므로,
  // 여기서도 composed-playbook 경로(extraTasks)로 명시 요청해야 detectAssetProfile이
  // nginx를 인식하고 WEB-* appliesTo 필터가 예전처럼 동작한다.
  const tasks = await runAnsibleChecks(containerName, webNginxPack.evidenceTasks);
  const profile = detectAssetProfile(tasks);
  return evaluateAllChecks(findings, tasks).filter((result) => {
    const appliesTo = getCatalogItem(result.id)?.appliesTo;
    if (!appliesTo || appliesTo.length === 0) return true;
    return appliesTo.some((tech) => profile.has(tech));
  });
}
