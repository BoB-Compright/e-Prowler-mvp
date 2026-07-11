"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Run, RunEvent, Stage } from "@/lib/pipeline/types";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import type { DecoratedCheckResult } from "@/lib/checks/types";
import { computeRiskSummary, overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { RiskSummaryBar } from "@/app/_components/RiskSummaryBar";
import { StatusBadge } from "@/app/_components/StatusBadge";
import type { BadgeStatus } from "@/app/_components/statusBadgeStyles";

const OUTCOME_BORDER_CLASS: Record<RunOutcome, string> = {
  fail: "border-l-fail",
  review: "border-l-review",
  pass: "border-l-pass",
};

// Marks the Claude analysis step as AI-driven, distinct from the rule-based
// stages around it.
function ClaudeSparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="12 10 78 82" fill="currentColor" className="inline-block flex-none">
      <path d="m83.5 49.281c-10.551-3.8984-18.871-12.219-22.781-22.781-0.25-0.67188-1.1914-0.67188-1.4414 0-3.8984 10.551-12.219 18.871-22.781 22.781-0.67188 0.25-0.67188 1.1914 0 1.4414 10.551 3.8984 18.871 12.219 22.781 22.781 0.25 0.67188 1.1914 0.67188 1.4414 0 3.8984-10.551 12.219-18.871 22.781-22.781 0.67188-0.25 0.67188-1.1914 0-1.4414z" />
      <path d="m39.75 24.141c-5.2812-1.9492-9.4414-6.1094-11.391-11.391-0.12109-0.32812-0.60156-0.32812-0.71875 0-1.9492 5.2812-6.1094 9.4414-11.391 11.391-0.32812 0.12109-0.32812 0.60156 0 0.71875 5.2812 1.9492 9.4414 6.1094 11.391 11.391 0.12109 0.32812 0.60156 0.32812 0.71875 0 1.9492-5.2812 6.1094-9.4414 11.391-11.391 0.32812-0.12109 0.32812-0.60156 0-0.71875z" />
      <path d="m43.828 79.262c-3.5195-1.3008-6.2891-4.0703-7.5898-7.5898-0.078125-0.21875-0.39844-0.21875-0.48047 0-1.3008 3.5195-4.0703 6.2891-7.5898 7.5898-0.21875 0.078125-0.21875 0.39844 0 0.48047 3.5195 1.3008 6.2891 4.0703 7.5898 7.5898 0.078126 0.21875 0.39844 0.21875 0.48047 0 1.3008-3.5195 4.0703-6.2891 7.5898-7.5898 0.21875-0.078126 0.21875-0.39844 0-0.48047z" />
    </svg>
  );
}

// Success checkmark for the completion banner — always the "pass" accent
// color, since it marks the scan process finishing, not the findings.
function CheckCircleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className="flex-none stroke-pass"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  );
}

const CONTAINER_STAGES: Stage[] = ["clone", "build", "sandbox", "ansible", "rule_eval", "claude", "done"];

// connect/ansible_scan/rule_evaluation/claude_analysis are the server (SSH)
// scan path's stages (A2): a run with sourceType "server" renders this
// 5-stage timeline instead of the 7-stage container one above.
const SERVER_STAGES: Stage[] = ["connect", "ansible_scan", "rule_evaluation", "claude_analysis", "done"];

const STAGE_LABELS: Record<Stage, string> = {
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

const STAGE_SHORT_LABELS: Record<Stage, string> = {
  clone: "가져오기",
  build: "빌드",
  sandbox: "환경 준비",
  ansible: "점검",
  rule_eval: "판정",
  claude: "AI 분석",
  connect: "연결",
  ansible_scan: "점검",
  rule_evaluation: "판정",
  claude_analysis: "AI 분석",
  done: "완료",
};

const STATUS_LABELS: Record<Run["status"], string> = {
  running: "진행 중",
  succeeded: "성공",
  failed: "실패",
  cancelled: "취소됨",
};

type NodeState = "done" | "current" | "failed" | "cancelled" | "pending";

// Kinetic 타임라인 도트: 완료 pass, 진행 primary(+scan-pulse-ring), 대기 neutral/40, 실패 fail.
// 취소됨은 실패(빨강)와 혼동되지 않도록 중립(neutral) 톤을 쓴다.
const STEPPER_CIRCLE_STYLES: Record<NodeState, string> = {
  done: "bg-pass text-white",
  current: "bg-primary text-white animate-[scan-pulse-ring_1.8s_infinite]",
  failed: "bg-fail text-white",
  cancelled: "bg-neutral/60 text-white",
  pending: "bg-neutral/40 text-muted",
};

const STEPPER_LABEL_STYLES: Record<NodeState, string> = {
  done: "text-pass font-medium",
  current: "text-primary font-bold",
  failed: "text-fail font-medium",
  cancelled: "text-muted font-medium",
  pending: "text-muted font-medium",
};

const STATE_BADGE_LABELS: Record<NodeState, string> = {
  done: "완료",
  current: "진행중",
  failed: "실패",
  cancelled: "취소됨",
  pending: "대기",
};

const NODE_BADGE_STATUS: Record<NodeState, BadgeStatus> = {
  done: "pass",
  current: "progress",
  failed: "fail",
  cancelled: "neutral",
  pending: "neutral",
};

function computeNodeStates(stages: Stage[], stage: Stage, status: Run["status"]): NodeState[] {
  const currentIndex = stages.indexOf(stage);
  return stages.map((_, i) => {
    if (status === "failed" && i === currentIndex) return "failed";
    if (status === "cancelled" && i === currentIndex) return "cancelled";
    if (i < currentIndex || (i === currentIndex && status === "succeeded")) return "done";
    if (i === currentIndex && status === "running") return "current";
    return "pending";
  });
}

// Most recent event recorded for this stage, if any — used as the vertical
// timeline's per-stage log line so it reflects real pipeline output instead
// of placeholder text.
function latestEventForStage(events: RunEvent[], stage: Stage): RunEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].stage === stage) return events[i];
  }
  return undefined;
}

export function RunStatus({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [checks, setChecks] = useState<DecoratedCheckResult[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [timelineVariant, setTimelineVariant] = useState<"horizontal" | "vertical">("horizontal");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.status === 404) {
        if (!cancelled) setNotFound(true);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setRun(data.run);
      setEvents(data.events);
      setChecks(data.checks);
      // Stop polling once the run has reached a terminal status.
      if (data.run.status !== "running") return;
      timer = setTimeout(poll, 2000);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  if (notFound) return <p className="text-fail">해당 실행을 찾을 수 없습니다.</p>;
  if (!run) return <p className="text-muted">불러오는 중…</p>;

  async function handleCancel() {
    setCancelError(null);
    setCancelPending(true);
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(data.error ?? "취소에 실패했습니다");
        return;
      }
      setRun(data.run);
      setConfirmingCancel(false);
    } finally {
      setCancelPending(false);
    }
  }

  const hasChecks = checks.length > 0;
  const riskSummary = computeRiskSummary(checks);
  const riskOutcome = overallRunOutcome(riskSummary);
  const aiCount = checks.filter((c) => c.source === "ai").length;

  const stages = run.sourceType === "server" ? SERVER_STAGES : CONTAINER_STAGES;
  const nodeStates = computeNodeStates(stages, run.stage, run.status);
  const connectorColor = (state: NodeState) => (state === "done" ? "bg-pass" : "bg-border");
  const progressPct = Math.round(
    (nodeStates.filter((s) => s === "done").length / stages.length) * 100,
  );
  // The fill line spans from the first circle's center to the last circle's
  // center, not the full container width — each circle owns an equal share
  // of the row, so its center sits half a share in from each edge.
  const edgeMarginPct = 100 / (stages.length * 2);
  const fillSpanPct = 100 - edgeMarginPct * 2;
  const fillWidthPct = (fillSpanPct * progressPct) / 100;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-[22px] font-bold tracking-tight">점검 실행 상태</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-violet-700">
          ✦ 자동 점검 + AI 하이브리드 분석
        </span>
        {run.sourceType === "local_image" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-700">
            로컬 이미지 재점검 (Fallback)
          </span>
        )}
        {run.sourceType === "server" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-sky-700">
            서버(SSH) 점검
          </span>
        )}
      </div>
      <p className="mt-1.5 break-all text-sm text-muted">{run.repoUrl}</p>

      <div className="mt-5 rounded-lg border border-border bg-surface p-3.5 text-sm leading-relaxed">
        <div
          className={`font-semibold ${
            run.status === "failed"
              ? "text-fail"
              : run.status === "succeeded"
                ? "text-pass"
                : run.status === "cancelled"
                  ? "text-muted"
                  : "text-primary"
          }`}
        >
          {STAGE_LABELS[run.stage]} · {STATUS_LABELS[run.status]}
        </div>
        {run.imageTag && (
          <div>
            이미지 태그: <span className="font-mono">{run.imageTag}</span>
          </div>
        )}
        {run.containerName && (
          <div>
            분석 컨테이너: <span className="font-mono">{run.containerName}</span>
          </div>
        )}
      </div>

      {run.status === "running" && (
        <div className="mt-3">
          {confirmingCancel ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium">
                정말 취소하시겠습니까? 진행 중인 점검이 중단됩니다.
              </span>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelPending}
                className="rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {cancelPending ? "취소 중..." : "취소 확정"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelPending}
                className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                되돌리기
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              점검 취소
            </button>
          )}
          {cancelError && <p className="mt-1 text-[13px] text-fail">{cancelError}</p>}
        </div>
      )}

      {run.errorMessage && (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-fail/30 bg-fail/5 p-3 text-xs text-fail">
          {run.errorMessage}
        </pre>
      )}

      <div className="mt-7 flex items-center justify-between gap-2.5">
        <span className="text-[12px] font-semibold text-muted">
          파이프라인 진행상태 <span className="font-mono">· {progressPct}%</span>
        </span>
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            onClick={() => setTimelineVariant("horizontal")}
            className={`px-3 py-1 text-[12.5px] ${
              timelineVariant === "horizontal"
                ? "bg-primary/10 font-semibold text-primary"
                : "bg-surface text-muted hover:bg-bg"
            }`}
          >
            가로 타임라인
          </button>
          <button
            onClick={() => setTimelineVariant("vertical")}
            className={`border-l border-border px-3 py-1 text-[12.5px] ${
              timelineVariant === "vertical"
                ? "bg-primary/10 font-semibold text-primary"
                : "bg-surface text-muted hover:bg-bg"
            }`}
          >
            세로 타임라인
          </button>
        </div>
      </div>

      {timelineVariant === "horizontal" ? (
        <div className="relative mt-6">
          <div
            className="absolute top-4 h-0.5 bg-border"
            style={{ left: `${edgeMarginPct}%`, right: `${edgeMarginPct}%` }}
          />
          <div
            className="absolute top-4 h-0.5 bg-pass transition-[width] duration-500 ease-out"
            style={{ left: `${edgeMarginPct}%`, width: `${fillWidthPct}%` }}
          />
          <div className="relative z-[1] flex items-start">
            {stages.map((stage, i) => {
              const state = nodeStates[i];
              const isAiStage = stage === "claude" || stage === "claude_analysis";
              return (
                <div key={stage} className="flex min-w-0 flex-1 flex-col items-center">
                  <div
                    className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-500 ${STEPPER_CIRCLE_STYLES[state]}`}
                  >
                    {state === "done" ? "✓" : state === "failed" ? "✕" : state === "cancelled" ? "–" : i + 1}
                    {isAiStage && (
                      <span className="absolute -top-1.5 -right-2 rounded-full bg-violet-600 px-1 py-px text-[8px] font-bold text-white">
                        AI
                      </span>
                    )}
                  </div>
                  <div
                    className={`mt-2 flex max-w-[76px] items-center justify-center gap-1 text-center text-[11.5px] leading-tight ${STEPPER_LABEL_STYLES[state]}`}
                  >
                    {STAGE_SHORT_LABELS[stage]}
                    {isAiStage && <ClaudeSparkleIcon />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col">
          {stages.map((stage, i) => {
            const state = nodeStates[i];
            const event = latestEventForStage(events, stage);
            const isAiStage = stage === "claude" || stage === "claude_analysis";
            return (
              <div key={stage} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs font-bold transition-colors duration-500 ${STEPPER_CIRCLE_STYLES[state]}`}
                  >
                    {state === "done" ? "✓" : state === "failed" ? "✕" : state === "cancelled" ? "–" : i + 1}
                  </div>
                  {i < stages.length - 1 && (
                    <div
                      className={`w-0.5 flex-1 transition-colors duration-500 ${connectorColor(state)}`}
                      style={{ minHeight: 20 }}
                    />
                  )}
                </div>
                {/* AI 분석 단계는 실데이터(isAiStage)가 있을 때만 강조 카드로 감싼다. */}
                <div
                  className={
                    isAiStage
                      ? "mb-1 flex-1 rounded-lg border border-primary/40 bg-primary/5 p-3"
                      : "flex-1 pb-3.5"
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold ${STEPPER_LABEL_STYLES[state]}`}>
                      {STAGE_LABELS[stage]}
                    </span>
                    {isAiStage && <ClaudeSparkleIcon />}
                    <StatusBadge status={NODE_BADGE_STATUS[state]}>{STATE_BADGE_LABELS[state]}</StatusBadge>
                  </div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                    {event?.message ?? (event ? `${STAGE_LABELS[stage]} → ${STATUS_LABELS[event.status]}` : "-")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 min-h-[72px] rounded-lg bg-[#0e1d2b] p-4 font-mono text-[12.5px] leading-relaxed text-[#e9f1ff]">
        {events.length === 0 && <div className="text-[#64748b]">$ 점검이 시작되면 로그가 여기에 표시됩니다.</div>}
        {events.map((event) => {
          const isFailed = event.status === "failed";
          const isCancelledEvent = event.status === "cancelled";
          const isRunning = event.status === "running";
          const prefix = isFailed ? "✕" : isCancelledEvent ? "■" : isRunning ? "▶" : "✓";
          const prefixColor = isFailed
            ? "#f87171"
            : isCancelledEvent
              ? "#94a3b8"
              : isRunning
                ? "#38bdf8"
                : "#4ade80";
          return (
            <div key={event.id}>
              <span className="text-[#64748b]">[{event.createdAt}]</span>{" "}
              <span style={{ color: prefixColor }}>{prefix}</span>{" "}
              {STAGE_LABELS[event.stage]} → {STATUS_LABELS[event.status]}
              {event.message ? ` — ${event.message}` : ""}
            </div>
          );
        })}
        {run.status === "running" && (
          <div>
            <span className="text-[#38bdf8]">$</span>{" "}
            <span className="animate-[terminal-cursor-blink_1s_step-end_infinite]">▋</span>
          </div>
        )}
      </div>

      {hasChecks && (
        <div className="mt-5">
          <RiskSummaryBar summary={riskSummary} />
        </div>
      )}

      {hasChecks && run.status !== "running" && (
        <div
          className={`mt-3.5 flex items-center gap-3.5 rounded-lg border border-l-[3px] border-border bg-bg p-3.5 ${OUTCOME_BORDER_CLASS[riskOutcome]}`}
        >
          <CheckCircleIcon />
          <div className="flex-1">
            <div className="font-bold">점검 완료 · {getRepoDisplayName(run.repoUrl)}</div>
            <div className="text-xs text-muted">
              {checks.length}개 항목 점검 ·{" "}
              <b className="text-fail">심각 {riskSummary.severityCounts.Critical}</b> ·{" "}
              <b className="text-review">높음 {riskSummary.severityCounts.High}</b> 발견 ·{" "}
              {aiCount > 0 ? (
                <span className="inline-flex items-center gap-1 align-[-2px] text-secondary">
                  개선안 생성됨 <ClaudeSparkleIcon />
                </span>
              ) : (
                "자동 점검 판정 완료"
              )}
            </div>
          </div>
          <Link
            href={`/runs/${runId}/report`}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-white hover:opacity-90"
          >
            상세 리포트 보기 →
          </Link>
        </div>
      )}
    </div>
  );
}
