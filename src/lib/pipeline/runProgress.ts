import type { Run } from "./types";

export interface RunProgress {
  label: string;
  fraction: number; // 0~1, done = 1
}

// 경로별 작업 단계 순서 (done 제외). fraction = 현재 단계 순번(1-base) / 전체 단계 수.
const CONTAINER_STAGES = ["clone", "build", "sandbox", "ansible", "rule_eval", "claude"] as const;
const LOCAL_IMAGE_STAGES = ["sandbox", "ansible", "rule_eval", "claude"] as const;
const SERVER_STAGES = ["connect", "ansible_scan", "rule_evaluation", "claude_analysis"] as const;

// 사용자에게 보이는 단계 라벨은 도구/기술 용어(Clone·Sandbox·Ansible·Claude·룰)
// 대신 일반적인 표현을 쓴다.
const STAGE_LABEL: Record<string, string> = {
  clone: "소스 가져오기",
  build: "이미지 빌드",
  sandbox: "분석 환경 준비",
  ansible: "보안 점검 실행",
  rule_eval: "취약점 판정",
  claude: "AI 심층 분석",
  connect: "서버 연결",
  ansible_scan: "보안 점검 실행",
  rule_evaluation: "취약점 판정",
  claude_analysis: "AI 심층 분석",
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
