"use client";

import { useEffect, useState } from "react";
import type { Run, RunEvent, Stage } from "@/lib/pipeline/types";
import {
  CATEGORY_LABELS,
  CHECK_STATUS_LABELS,
  type Category,
  type CheckStatus,
  type Severity,
} from "@/lib/catalog/types";

type Source = "rule" | "ai";

interface CheckResultView {
  id: string;
  status: CheckStatus;
  evidence: string;
  title: string;
  severity: Severity | null;
  category: Category | null;
  source: Source;
  reason: string | null;
  remediation: string | null;
  example: string | null;
}

interface CheckGroup {
  key: string;
  label: string;
  checks: CheckResultView[];
}

const STAGES: Stage[] = ["clone", "build", "sandbox", "ansible", "rule_eval", "claude", "done"];

const STAGE_LABELS: Record<Stage, string> = {
  clone: "레포 Clone",
  build: "Docker 빌드",
  sandbox: "Sandbox 실행",
  ansible: "Ansible 점검",
  rule_eval: "가이드 기반 룰 평가",
  claude: "Claude 분석",
  done: "완료",
};

const STAGE_SHORT_LABELS: Record<Stage, string> = {
  clone: "Clone",
  build: "Build",
  sandbox: "Sandbox",
  ansible: "Ansible",
  rule_eval: "룰 평가",
  claude: "Claude",
  done: "완료",
};

const STATUS_LABELS: Record<Run["status"], string> = {
  running: "진행 중",
  succeeded: "성공",
  failed: "실패",
};

const CHECK_STATUS_STYLES: Record<CheckStatus, string> = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  review: "bg-yellow-100 text-yellow-800",
  skip: "bg-slate-100 text-slate-600",
  not_automated: "bg-slate-100 text-slate-400",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-slate-100 text-slate-700",
};

const SOURCE_LABELS: Record<Source, string> = { rule: "룰 기반", ai: "AI 분석" };
const SOURCE_STYLES: Record<Source, string> = {
  rule: "bg-slate-100 text-slate-600",
  ai: "bg-violet-100 text-violet-700",
};

const CATEGORY_ORDER: Category[] = ["container", "unix", "web"];

type NodeState = "done" | "current" | "failed" | "pending";

const STEPPER_CIRCLE_STYLES: Record<NodeState, string> = {
  done: "bg-green-500 text-white",
  current: "bg-blue-500 text-white animate-[scan-pulse-ring_1.8s_infinite]",
  failed: "bg-red-500 text-white",
  pending: "bg-white border-2 border-slate-200 text-slate-400",
};

const STEPPER_LABEL_STYLES: Record<NodeState, string> = {
  done: "text-green-800 font-medium",
  current: "text-blue-700 font-bold",
  failed: "text-red-700 font-medium",
  pending: "text-slate-400 font-medium",
};

function computeNodeStates(stage: Stage, status: Run["status"]): NodeState[] {
  const currentIndex = STAGES.indexOf(stage);
  return STAGES.map((_, i) => {
    if (status === "failed" && i === currentIndex) return "failed";
    if (i < currentIndex || (i === currentIndex && status === "succeeded")) return "done";
    if (i === currentIndex && status === "running") return "current";
    return "pending";
  });
}

function groupSummaryText(checks: CheckResultView[]): string {
  const pass = checks.filter((c) => c.status === "pass").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const review = checks.filter((c) => c.status === "review").length;
  return `양호 ${pass} · 취약 ${fail} · 검토 ${review}`;
}

// A run currently scans exactly one repo, so "asset" grouping collapses to a
// single group named after that repo. Once a run can cover multiple assets,
// only this function needs to change.
function getRepoDisplayName(repoUrl: string): string {
  const match = repoUrl.match(/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  return match ? match[1] : repoUrl;
}

function buildCategoryGroups(checks: CheckResultView[]): CheckGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    key: category,
    label: CATEGORY_LABELS[category],
    checks: checks.filter((c) => c.category === category),
  })).filter((group) => group.checks.length > 0);
}

function buildAssetGroups(checks: CheckResultView[], repoUrl: string): CheckGroup[] {
  if (checks.length === 0) return [];
  return [{ key: `asset:${repoUrl}`, label: getRepoDisplayName(repoUrl), checks }];
}

export function RunStatus({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [checks, setChecks] = useState<CheckResultView[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [groupBy, setGroupBy] = useState<"category" | "asset">("category");

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

  if (notFound) return <p className="text-red-600">해당 실행을 찾을 수 없습니다.</p>;
  if (!run) return <p className="text-slate-500">불러오는 중…</p>;

  function toggleCheck(id: string) {
    setExpandedChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function changeGroupBy(next: "category" | "asset") {
    setGroupBy(next);
    setCollapsedGroups({});
  }

  function toggleAll() {
    const next: Record<string, boolean> = {};
    checks.forEach((c) => {
      next[c.id] = !allExpanded;
    });
    setExpandedChecks(next);
  }

  const hasChecks = checks.length > 0;
  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const reviewCount = checks.filter((c) => c.status === "review").length;
  const aiCount = checks.filter((c) => c.source === "ai").length;
  const allExpanded = hasChecks && checks.every((c) => expandedChecks[c.id]);
  const groups =
    groupBy === "asset" ? buildAssetGroups(checks, run.repoUrl) : buildCategoryGroups(checks);

  const nodeStates = computeNodeStates(run.stage, run.status);
  const connectorColor = (state: NodeState) => (state === "done" ? "bg-green-500" : "bg-slate-200");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-[22px] font-bold tracking-tight">점검 실행 상태</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-violet-700">
          ✦ 룰 + Claude AI 하이브리드 분석
        </span>
      </div>
      <p className="mt-1.5 break-all text-sm text-slate-500">{run.repoUrl}</p>

      <div className="mt-9 flex items-start">
        {STAGES.map((stage, i) => {
          const state = nodeStates[i];
          return (
            <div key={stage} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <div
                  className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : connectorColor(nodeStates[i - 1])}`}
                />
                <div
                  className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${STEPPER_CIRCLE_STYLES[state]}`}
                >
                  {state === "done" ? "✓" : state === "failed" ? "✕" : i + 1}
                  {stage === "claude" && (
                    <span className="absolute -top-1.5 -right-2 rounded-full bg-violet-600 px-1 py-px text-[8px] font-bold text-white">
                      AI
                    </span>
                  )}
                </div>
                <div
                  className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? "bg-transparent" : connectorColor(state)}`}
                />
              </div>
              <div
                className={`mt-2 max-w-[76px] text-center text-[11.5px] leading-tight ${STEPPER_LABEL_STYLES[state]}`}
              >
                {STAGE_SHORT_LABELS[stage]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">
        <div
          className={`font-semibold ${
            run.status === "failed"
              ? "text-red-700"
              : run.status === "succeeded"
                ? "text-green-800"
                : "text-blue-700"
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
            Sandbox 컨테이너: <span className="font-mono">{run.containerName}</span>
          </div>
        )}
      </div>

      {run.errorMessage && (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {run.errorMessage}
        </pre>
      )}

      {hasChecks ? (
        <>
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-[13px] font-semibold text-green-800">
              <span className="h-[7px] w-[7px] rounded-full bg-green-500" />
              양호 {passCount}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-[13px] font-semibold text-red-800">
              <span className="h-[7px] w-[7px] rounded-full bg-red-500" />
              취약 {failCount}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1.5 text-[13px] font-semibold text-yellow-800">
              <span className="h-[7px] w-[7px] rounded-full bg-yellow-500" />
              검토 {reviewCount}
            </span>
            {aiCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-[13px] font-semibold text-violet-700">
                ✦ Claude AI 교차검증 {aiCount}건
              </span>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-2.5">
            <h2 className="text-sm font-semibold text-slate-500">
              점검 결과 <span className="font-normal">({checks.length}개)</span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-slate-200">
                <button
                  onClick={() => changeGroupBy("category")}
                  className={`px-3 py-1 text-[12.5px] ${
                    groupBy === "category"
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  카테고리
                </button>
                <button
                  onClick={() => changeGroupBy("asset")}
                  className={`border-l border-slate-200 px-3 py-1 text-[12.5px] ${
                    groupBy === "asset"
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  자산
                </button>
              </div>
              <button
                onClick={toggleAll}
                className="rounded-md border border-slate-200 bg-white px-3 py-1 text-[12.5px] text-slate-700 hover:bg-slate-50"
              >
                {allExpanded ? "전체 접기" : "전체 펼치기"}
              </button>
            </div>
          </div>

          <div className="mt-3.5 flex flex-col gap-5">
            {groups.map((group) => {
              const collapsed = !!collapsedGroups[group.key];
              return (
                <div key={group.key}>
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 rounded px-1 py-2 text-left hover:bg-slate-50"
                  >
                    <span
                      className={`inline-block text-[11px] text-slate-400 transition-transform duration-150 ${
                        collapsed ? "" : "rotate-90"
                      }`}
                    >
                      ▸
                    </span>
                    <span className="text-[13.5px] font-semibold">{group.label}</span>
                    <span className="text-[12.5px] text-slate-400">{group.checks.length}개</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {groupSummaryText(group.checks)}
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="mt-2 flex flex-col gap-2">
                      {group.checks.map((check) => (
                        <CheckCard
                          key={check.id}
                          check={check}
                          expanded={!!expandedChecks[check.id]}
                          onToggle={() => toggleCheck(check.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-8 text-[13px] text-slate-400 italic">
          아직 점검 결과가 없습니다 — 파이프라인이 진행되면 이 영역에 표시됩니다.
        </p>
      )}

      <h2 className="mt-10 text-sm font-semibold text-slate-500">진행 이력</h2>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {events.map((event) => (
          <div key={event.id} className="flex gap-2.5 text-[12.5px]">
            <span className="font-mono text-slate-400">{event.createdAt}</span>
            <span className="text-slate-600">
              {STAGE_LABELS[event.stage]} → {STATUS_LABELS[event.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckCard({
  check,
  expanded,
  onToggle,
}: {
  check: CheckResultView;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 px-3.5 py-2.5 text-left hover:bg-slate-50"
      >
        <span
          className={`inline-block w-2.5 text-[11px] text-slate-400 transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
        <span className="font-mono text-xs text-slate-500">{check.id}</span>
        <span className="text-[13.5px]">{check.title}</span>
        {check.severity && (
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLES[check.severity]}`}
          >
            {check.severity}
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${CHECK_STATUS_STYLES[check.status]}`}
        >
          {CHECK_STATUS_LABELS[check.status]}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLES[check.source]}`}
        >
          {SOURCE_LABELS[check.source]}
        </span>
      </button>
      <div className="px-3.5 pb-3 pl-10 text-[13px] text-slate-600">Evidence: {check.evidence}</div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-slate-100 px-3.5 pt-2 pb-4 pl-10">
          {check.reason && (
            <div className="mt-2.5">
              <span
                className={`text-[11px] font-bold tracking-wide ${
                  check.source === "ai" ? "text-violet-700" : "text-slate-400"
                }`}
              >
                {check.source === "ai" ? "AI 분석 근거" : "룰 기반 판단 근거"}
              </span>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{check.reason}</p>
            </div>
          )}
          {check.remediation && (
            <p className="text-[13px] leading-relaxed text-slate-700">
              <span className="font-semibold">조치방안: </span>
              {check.remediation}
            </p>
          )}
          {check.example && (
            <pre className="rounded-md border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs whitespace-pre-wrap text-slate-700">
              {check.example}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
