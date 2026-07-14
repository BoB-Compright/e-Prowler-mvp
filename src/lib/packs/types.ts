import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { DockerfileFindings } from "@/lib/checks/dockerfileChecks";
import type { CheckResult } from "@/lib/checks/types";

// 하나의 ansible raw 태스크. name은 플레이북 내 유일해야 하며,
// ruleEvaluation의 findTaskOutput이 `<id>:` 프리픽스로 매칭하는 그 이름이다.
export interface PlaybookTask {
  name: string;
  raw: string;
}

export interface EvalContext {
  findings: DockerfileFindings | null;
  tasks: AnsibleTaskOutput[];
}

// 한 점검군(벤더 또는 베이스라인)을 자기 완결적으로 표현한다.
export interface VendorPack {
  id: string;
  category: "OS" | "WEB" | "WAS" | "DB" | "container";
  vendors: string[];
  executionPath: "linux" | "windows";
  itemIds: string[];
  evidenceTasks: PlaybookTask[];
  detect(tasks: AnsibleTaskOutput[]): boolean;
  evaluate(ctx: EvalContext): CheckResult[];
}

export interface CheckPlan {
  packs: VendorPack[];
  evidenceTasks: PlaybookTask[];
  // "declared"(서버: 선언 벤더, 미확인→review) | "autodetect"(이미지: 자동 탐지, 미탐지→skip).
  // 생략 시 "declared"(하위호환).
  mode?: "declared" | "autodetect";
}
