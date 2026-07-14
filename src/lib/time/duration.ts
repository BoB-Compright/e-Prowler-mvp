import type { RunStatus } from "@/lib/pipeline/types";

export interface DurationInput {
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DurationView =
  | { kind: "done" | "running" | "approx"; seconds: number }
  | { kind: "pending" };

function diffSeconds(fromIso: string, toMs: number): number {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.floor((toMs - from) / 1000));
}

// 표시할 소요시간을 파생한다(저장값은 건드리지 않음). 큐 대기시간은 started_at 기준이라 자연히 제외된다.
export function computeDurationSeconds(run: DurationInput, nowMs: number): DurationView {
  if (run.startedAt && run.finishedAt) {
    return { kind: "done", seconds: diffSeconds(run.startedAt, Date.parse(run.finishedAt)) };
  }
  if (run.startedAt && !run.finishedAt) {
    return { kind: "running", seconds: diffSeconds(run.startedAt, nowMs) };
  }
  // started_at이 없다: 아직 실행 전(대기) 이거나, 이 기능 배포 전의 과거 이력.
  if (run.status === "running") {
    return { kind: "pending" };
  }
  return { kind: "approx", seconds: diffSeconds(run.createdAt, Date.parse(run.updatedAt)) };
}

// 한국어 단위. 43초 / 2분 07초(분 있으면 초 2자리, 초=0이면 "2분") / 1시간 5분(시간 있으면 초 생략, 분=0이면 "1시간").
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total}초`;
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s === 0 ? `${m}분` : `${m}분 ${String(s).padStart(2, "0")}초`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
