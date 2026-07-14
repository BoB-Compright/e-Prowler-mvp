"use client";

import { useEffect, useState } from "react";
import type { RunStatus } from "@/lib/pipeline/types";
import { computeDurationSeconds, formatDuration } from "@/lib/time/duration";

interface Props {
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  className?: string;
}

// 진행 중이면 1초마다 경과를 갱신하는 라이브 타이머. 종료된 run은 정적 표시.
export function RunDuration({ status, startedAt, finishedAt, createdAt, updatedAt, className }: Props) {
  const isLive = status === "running" && !!startedAt && !finishedAt;
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isLive) return;
    // react-hooks/set-state-in-effect: effect 본문에서 동기 setState를 피한다
    // (CountUp.tsx와 동일 컨벤션). 첫 틱은 setInterval의 첫 콜백(1초 후)에서 온다 —
    // 그 전까지는 아래 nowMs ?? Date.parse(updatedAt) 폴백이 안정값을 보여준다.
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive]);

  const base = className ?? "font-mono text-[13px] text-muted";
  // SSR/최초 렌더는 서버 시계 기준 안정값(hydration mismatch 방지). 라이브는 마운트 후 nowMs로 갱신.
  const view = computeDurationSeconds(
    { status, startedAt, finishedAt, createdAt, updatedAt },
    nowMs ?? Date.parse(updatedAt),
  );

  if (view.kind === "pending") return <span className={base}>대기 중</span>;
  return <span className={base}>{formatDuration(view.seconds)}</span>;
}
