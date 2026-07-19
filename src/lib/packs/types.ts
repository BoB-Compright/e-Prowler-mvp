import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { DockerfileFindings } from "@/lib/checks/dockerfileChecks";
import type { CheckResult } from "@/lib/checks/types";

// 하나의 ansible raw 태스크. name은 플레이북 내 유일해야 하며,
// ruleEvaluation의 findTaskOutput이 `<id>:` 프리픽스로 매칭하는 그 이름이다.
export interface PlaybookTask {
  name: string;
  raw: string;
}

// 벤더 점검에 필요한 사전 입력값 스펙. 팩이 선언하면 등록 폼·저장·스캔이 이 선언 하나로 동작한다.
export type ScanInputKind = "text" | "path" | "secret";
export interface ScanInputSpec {
  name: string; // ansible 변수명 = extra-vars 키 (예: "tibero_db_pass")
  label: string; // 폼 라벨
  kind: ScanInputKind; // secret이면 암호화 저장 + password 입력
  required: boolean;
  help?: string;
  placeholder?: string;
}

export interface EvalContext {
  findings: DockerfileFindings | null;
  tasks: AnsibleTaskOutput[];
  // 값이 실제로 제공된 입력값의 name 집합. evaluate가 필수 입력 누락을 review로 처리하는 데 쓴다.
  inputsProvided?: Set<string>;
}

// 한 점검군(벤더 또는 베이스라인)을 자기 완결적으로 표현한다.
export interface VendorPack {
  id: string;
  category: "OS" | "WEB" | "WAS" | "DB" | "container";
  vendors: string[];
  executionPath: "linux" | "windows";
  itemIds: string[];
  evidenceTasks: PlaybookTask[];
  // 이 팩이 점검 전 필요로 하는 사전 입력값. 미선언이면 입력 불필요(하위호환).
  requiredInputs?: ScanInputSpec[];
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
