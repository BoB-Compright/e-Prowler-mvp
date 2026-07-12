import { getCatalogByCategory } from "@/lib/catalog";
import * as R from "@/lib/checks/ruleEvaluation";
import type { EvalContext, VendorPack } from "./types";
import type { CheckResult } from "@/lib/checks/types";

// C-01..C-09 평가기를 evaluateAllChecks와 동일 순서로. C-*는 Dockerfile
// findings를 쓰는 항목이 있어 ctx.findings를 넘긴다.
function evaluateContainer(ctx: EvalContext): CheckResult[] {
  const { findings, tasks } = ctx;
  return [
    R.evaluateC01(findings, tasks), R.evaluateC02(findings), R.evaluateC03(findings, tasks),
    R.evaluateC04(findings), R.evaluateC05(tasks), R.evaluateC06(tasks), R.evaluateC07(tasks),
    R.evaluateC08(findings), R.evaluateC09(findings),
  ];
}

export const containerPack: VendorPack = {
  id: "container",
  category: "container",
  vendors: [],
  executionPath: "linux",
  itemIds: getCatalogByCategory("container").map((i) => i.id),
  evidenceTasks: [],
  detect: () => true,
  evaluate: evaluateContainer,
};
