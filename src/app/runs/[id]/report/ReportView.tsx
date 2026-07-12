"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Run } from "@/lib/pipeline/types";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import { getFrameworks } from "@/lib/catalog";
import {
  CHECK_STATUS_LABELS,
  type Category,
  type CheckStatus,
  type Severity,
} from "@/lib/catalog/types";
import type { CheckResultSource, DecoratedCheckResult } from "@/lib/checks/types";
import { computeRiskSummary } from "@/lib/checks/riskSummary";
import { RiskSummaryBar } from "@/app/_components/RiskSummaryBar";
import { Card } from "@/app/_components/Card";
import { SectionLabel } from "@/app/_components/SectionLabel";
import { StatusBadge } from "@/app/_components/StatusBadge";
import type { BadgeStatus } from "@/app/_components/statusBadgeStyles";
import { RescanButton } from "./RescanButton";

const CATEGORY_CHIP_LABELS: Record<Category, string> = {
  container: "컨테이너",
  unix: "Unix",
  web: "웹",
  was: "WAS",
  db: "DB",
  windows: "Windows",
};

const CHECK_STATUS_BADGE: Record<CheckStatus, BadgeStatus> = {
  pass: "pass",
  fail: "fail",
  review: "review",
  skip: "neutral",
  not_automated: "neutral",
};

// severity 매핑 관례: critical/high → fail, medium → review, low → neutral.
const SEVERITY_STATUS: Record<Severity, BadgeStatus> = {
  Critical: "fail",
  High: "fail",
  Medium: "review",
  Low: "neutral",
};

const SOURCE_LABELS: Record<CheckResultSource, string> = { rule: "룰 기반", ai: "AI 판정" };
const SOURCE_STYLES: Record<CheckResultSource, string> = {
  rule: "bg-neutral/15 text-muted",
  ai: "bg-violet-100 text-violet-700",
};

// 룰이 판정을 보류(검토)한 항목을 AI가 판정했음을 표시하는 아이콘. RunStatus.tsx의
// ClaudeSparkleIcon과 동일한 SVG를 로컬에 둔다(공용 컴포넌트로 추출할 만큼은 아님).
function ClaudeSparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="12 10 78 82" fill="currentColor" className="inline-block flex-none">
      <path d="m83.5 49.281c-10.551-3.8984-18.871-12.219-22.781-22.781-0.25-0.67188-1.1914-0.67188-1.4414 0-3.8984 10.551-12.219 18.871-22.781 22.781-0.67188 0.25-0.67188 1.1914 0 1.4414 10.551 3.8984 18.871 12.219 22.781 22.781 0.25 0.67188 1.1914 0.67188 1.4414 0 3.8984-10.551 12.219-18.871 22.781-22.781 0.67188-0.25 0.67188-1.1914 0-1.4414z" />
      <path d="m39.75 24.141c-5.2812-1.9492-9.4414-6.1094-11.391-11.391-0.12109-0.32812-0.60156-0.32812-0.71875 0-1.9492 5.2812-6.1094 9.4414-11.391 11.391-0.32812 0.12109-0.32812 0.60156 0 0.71875 5.2812 1.9492 9.4414 6.1094 11.391 11.391 0.12109 0.32812 0.60156 0.32812 0.71875 0 1.9492-5.2812 6.1094-9.4414 11.391-11.391 0.32812-0.12109 0.32812-0.60156 0-0.71875z" />
      <path d="m43.828 79.262c-3.5195-1.3008-6.2891-4.0703-7.5898-7.5898-0.078125-0.21875-0.39844-0.21875-0.48047 0-1.3008 3.5195-4.0703 6.2891-7.5898 7.5898-0.21875 0.078125-0.21875 0.39844 0 0.48047 3.5195 1.3008 6.2891 4.0703 7.5898 7.5898 0.078126 0.21875 0.39844 0.21875 0.48047 0 1.3008-3.5195 4.0703-6.2891 7.5898-7.5898 0.21875-0.078126 0.21875-0.39844 0-0.48047z" />
    </svg>
  );
}

function chipStyle(active: boolean): string {
  return `rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap ${
    active
      ? "border-primary bg-surface font-semibold text-primary"
      : "border-border text-muted hover:bg-bg"
  }`;
}

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function InlineCodeText({ text }: { text: string }) {
  const parts = text.split("`");
  // 백틱 짝이 안 맞으면 스타일 없이 원문 그대로
  if (parts.length % 2 === 0) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-bg px-1.5 py-0.5 font-mono text-[12.5px]">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function ReportView({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [checks, setChecks] = useState<DecoratedCheckResult[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CheckStatus | "all">("all");
  const [frameworkFilter, setFrameworkFilter] = useState<string | null>(null);
  const [aiOnly, setAiOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.status === 404) {
        if (!cancelled) setNotFound(true);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setRun(data.run);
      setChecks(data.checks);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (notFound) return <p className="text-fail">해당 실행을 찾을 수 없습니다.</p>;
  if (!run) return <p className="text-muted">불러오는 중…</p>;

  const frameworks = getFrameworks();
  const presentFrameworkIds = Array.from(
    new Set(checks.map((c) => c.frameworkId).filter((x): x is string => !!x)),
  );
  const visibleFrameworks = frameworks.filter((f) => presentFrameworkIds.includes(f.id));
  const hasAiVerdicts = checks.some((c) => c.source === "ai");

  const filtered = checks.filter(
    (c) =>
      (categoryFilter === "all" || c.category === categoryFilter) &&
      (statusFilter === "all" || c.status === statusFilter) &&
      (!frameworkFilter || c.frameworkId === frameworkFilter) &&
      (!aiOnly || c.source === "ai"),
  );
  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;
  const summary = computeRiskSummary(checks);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">보안 점검 보고서</h1>
          <p className="mt-1 text-[13px] text-muted">
            <span className="font-mono">{getRepoDisplayName(run.repoUrl)}</span>
            <span className="mx-1.5">·</span>
            <span className="font-mono">{formatTimestamp(run.updatedAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {run.status === "running" && (
            <span className="text-xs font-semibold text-secondary">
              점검 진행 중 — 일부 항목만 표시됨
            </span>
          )}
          {run.status !== "running" && run.assetId && <RescanButton assetId={run.assetId} />}
          {run.status === "succeeded" && (
            <a
              href={`/api/runs/${runId}/export`}
              download
              className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-primary hover:bg-primary/5"
            >
              보고서 내보내기
            </a>
          )}
          <Link
            href={`/runs/${runId}`}
            className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
          >
            ← 실행 상태 보기
          </Link>
        </div>
      </div>

      {checks.length > 0 && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>Total Checks</SectionLabel>
              <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">
                {summary.total}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>Pass</SectionLabel>
              <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] text-pass">
                {summary.statusCounts.pass}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>Fail</SectionLabel>
              <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] text-fail">
                {summary.statusCounts.fail}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>Review</SectionLabel>
              <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] text-review">
                {summary.statusCounts.review}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <RiskSummaryBar summary={summary} />
          </div>
        </>
      )}

      {checks.length === 0 ? (
        <p className="mt-8 text-[13px] text-muted italic">아직 점검 결과가 없습니다.</p>
      ) : (
        <div className="mt-6 flex flex-wrap items-start gap-4">
          <Card className="min-w-[320px] max-w-[420px] flex-1 overflow-hidden" bodyClassName="p-0">
            <div className="border-b border-border p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <SectionLabel>점검 항목</SectionLabel>
                <span className="font-mono text-xs text-muted">{filtered.length}건 표시</span>
              </div>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <button className={chipStyle(categoryFilter === "all")} onClick={() => setCategoryFilter("all")}>
                  전체
                </button>
                {(Object.keys(CATEGORY_CHIP_LABELS) as Category[]).map((cat) => (
                  <button
                    key={cat}
                    className={chipStyle(categoryFilter === cat)}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {CATEGORY_CHIP_LABELS[cat]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className={chipStyle(statusFilter === "all")} onClick={() => setStatusFilter("all")}>
                  전체
                </button>
                {(Object.keys(CHECK_STATUS_LABELS) as CheckStatus[]).map((status) => (
                  <button
                    key={status}
                    className={chipStyle(statusFilter === status)}
                    onClick={() => setStatusFilter(status)}
                  >
                    {CHECK_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
              {visibleFrameworks.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    className={chipStyle(!frameworkFilter)}
                    onClick={() => setFrameworkFilter(null)}
                  >
                    전체
                  </button>
                  {visibleFrameworks.map((f) => (
                    <button
                      key={f.id}
                      className={chipStyle(frameworkFilter === f.id)}
                      onClick={() => setFrameworkFilter(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
              {hasAiVerdicts && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button className={chipStyle(aiOnly)} onClick={() => setAiOnly(!aiOnly)}>
                    AI 판정
                  </button>
                </div>
              )}
            </div>
            <div className="max-h-[560px] overflow-auto">
              {filtered.map((check) => {
                const isSelected = check.id === selected?.id;
                return (
                  <button
                    key={check.id}
                    onClick={() => setSelectedId(check.id)}
                    className={`block w-full border-b border-border px-3.5 py-2.5 text-left last:border-0 ${
                      isSelected ? "border-l-[3px] border-l-primary bg-bg" : "hover:bg-bg"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">{check.id}</span>
                      <StatusBadge status={CHECK_STATUS_BADGE[check.status]}>
                        {CHECK_STATUS_LABELS[check.status]}
                      </StatusBadge>
                      {check.source === "ai" && (
                        <span
                          title="룰이 판정을 보류(검토)한 항목을 AI가 점검 증거로 판정함"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary"
                        >
                          <ClaudeSparkleIcon /> AI 판정
                        </span>
                      )}
                      {check.severity && (
                        <span className="ml-auto">
                          <StatusBadge status={SEVERITY_STATUS[check.severity]}>
                            {check.severity}
                          </StatusBadge>
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[13px]">{check.title}</div>
                    {check.frameworkId && (
                      <span className="mt-1 inline-block rounded bg-bg px-2 py-0.5 text-[11px] text-muted">
                        {frameworks.find((f) => f.id === check.frameworkId)?.name ?? check.frameworkId}
                        {check.sourceRef ? ` · ${check.sourceRef}` : ""}
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="p-3.5 text-[13px] text-muted italic">조건에 맞는 항목이 없습니다.</p>
              )}
            </div>
          </Card>

          {selected && (
            <Card className="min-w-[360px] flex-[2]">
              <div className="font-mono text-[11px] text-muted">
                이력 / {getRepoDisplayName(run.repoUrl)} / {CATEGORY_CHIP_LABELS[selected.category ?? "container"]}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-[26px] font-extrabold tracking-tight">{selected.id}</span>
                <StatusBadge status={CHECK_STATUS_BADGE[selected.status]}>
                  {CHECK_STATUS_LABELS[selected.status]}
                </StatusBadge>
                {selected.severity && (
                  <StatusBadge status={SEVERITY_STATUS[selected.severity]}>{selected.severity}</StatusBadge>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLES[selected.source]}`}
                >
                  {SOURCE_LABELS[selected.source]}
                </span>
              </div>
              <h2 className="mt-2.5 text-[19px] leading-snug font-bold">{selected.title}</h2>

              <div className="mt-5">
                <SectionLabel>
                  {/* reason은 검증 provenance(source)와 무관하게 항상 Claude가
                      작성한다 — 있으면 항상 "AI 분석 근거"로 표기한다. */}
                  {selected.reason ? "AI 분석 근거" : "설명"}
                </SectionLabel>
                <p className="mt-1.5 text-sm leading-relaxed">
                  {selected.reason ? (
                    <InlineCodeText text={selected.reason} />
                  ) : (
                    "아직 분석되지 않았습니다."
                  )}
                </p>
              </div>

              <div className="mt-4.5">
                <SectionLabel>근거 · Evidence</SectionLabel>
                <pre className="mt-1.5 overflow-x-auto rounded-lg border border-[#1E293B] bg-[#0B1220] p-3 font-mono text-xs whitespace-pre-wrap text-[#CBD5E1]">
                  {selected.evidence}
                </pre>
              </div>

              {selected.remediation && (
                <div className="mt-4.5">
                  <SectionLabel>조치방안</SectionLabel>
                  <p className="mt-1.5 text-sm leading-relaxed">
                    <InlineCodeText text={selected.remediation} />
                  </p>
                </div>
              )}

              {selected.example && (
                <div className="mt-4.5">
                  <SectionLabel>설정 예시</SectionLabel>
                  <pre className="mt-1.5 overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap">
                    {selected.example}
                  </pre>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
