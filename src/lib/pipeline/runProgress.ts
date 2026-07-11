import type { Run } from "./types";

export interface RunProgress {
  label: string;
  fraction: number; // 0~1, done = 1
}

// 경로별 작업 단계 순서 (done 제외). fraction = 현재 단계 순번(1-base) / 전체 단계 수.
const CONTAINER_STAGES = ["clone", "build", "sandbox", "ansible", "rule_eval", "claude"] as const;
const LOCAL_IMAGE_STAGES = ["sandbox", "ansible", "rule_eval", "claude"] as const;
const SERVER_STAGES = ["connect", "ansible_scan", "rule_evaluation", "claude_analysis"] as const;

const STAGE_LABEL: Record<string, string> = {
  clone: "클론",
  build: "빌드",
  sandbox: "샌드박스 준비",
  ansible: "Ansible 점검",
  rule_eval: "규칙 평가",
  claude: "AI 분석",
  connect: "SSH 연결",
  ansible_scan: "Ansible 점검",
  rule_evaluation: "규칙 평가",
  claude_analysis: "AI 분석",
  done: "완료",
};

export function runProgress(run: Pick<Run, "stage" | "sourceType">): RunProgress {
  if (run.stage === "done") return { label: "완료", fraction: 1 };
  const order: readonly string[] =
    run.sourceType === "server"
      ? SERVER_STAGES
      : run.sourceType === "local_image"
        ? LOCAL_IMAGE_STAGES
        : CONTAINER_STAGES;
  const index = order.indexOf(run.stage);
  const label = STAGE_LABEL[run.stage] ?? run.stage;
  // 경로에 없는 stage(신규 단계 추가 등)는 진행률을 추정하지 않는다.
  if (index < 0) return { label, fraction: 0 };
  return { label, fraction: (index + 1) / order.length };
}
