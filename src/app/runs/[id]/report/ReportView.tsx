"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Run } from "@/lib/pipeline/types";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import {
  CHECK_STATUS_LABELS,
  type Category,
  type CheckStatus,
  type Severity,
} from "@/lib/catalog/types";
import type { CheckResultSource, DecoratedCheckResult } from "@/lib/checks/types";
import { computeRiskSummary } from "@/lib/checks/riskSummary";
import { RiskSummaryBar } from "@/app/_components/RiskSummaryBar";

const CATEGORY_CHIP_LABELS: Record<Category, string> = {
  container: "컨테이너",
  unix: "Unix",
  web: "웹",
};

const STATUS_STYLES: Record<CheckStatus, string> = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  review: "bg-yellow-100 text-yellow-800",
  skip: "bg-slate-100 text-[var(--color-muted)]",
  not_automated: "bg-slate-100 text-[var(--color-muted)]",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-slate-100 text-slate-700",
};

const SOURCE_LABELS: Record<CheckResultSource, string> = { rule: "룰 기반", ai: "AI 분석" };
const SOURCE_STYLES: Record<CheckResultSource, string> = {
  rule: "bg-slate-100 text-[var(--color-muted)]",
  ai: "bg-violet-100 text-violet-700",
};

function chipStyle(active: boolean): string {
  return `rounded-[var(--radius-nh)] border px-2.5 py-1 text-xs whitespace-nowrap ${
    active
      ? "border-[var(--color-primary)] bg-[var(--color-surface)] font-semibold text-[var(--color-primary)]"
      : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
  }`;
}

export function ReportView({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [checks, setChecks] = useState<DecoratedCheckResult[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CheckStatus | "all">("all");
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

  if (notFound) return <p className="text-red-600">해당 실행을 찾을 수 없습니다.</p>;
  if (!run) return <p className="text-[var(--color-muted)]">불러오는 중…</p>;

  const filtered = checks.filter(
    (c) =>
      (categoryFilter === "all" || c.category === categoryFilter) &&
      (statusFilter === "all" || c.status === statusFilter),
  );
  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">상세 리포트</h1>
          <p className="mt-1 break-all text-sm text-[var(--color-muted)]">{run.repoUrl}</p>
        </div>
        <div className="flex items-center gap-3">
          {run.status === "running" && (
            <span className="text-xs font-semibold text-[var(--color-secondary)]">
              점검 진행 중 — 일부 항목만 표시됨
            </span>
          )}
          <Link
            href={`/runs/${runId}`}
            className="text-[12.5px] font-semibold text-[var(--color-primary)] hover:underline"
          >
            ← 실행 상태 보기
          </Link>
        </div>
      </div>

      {checks.length > 0 && (
        <div className="mt-5">
          <RiskSummaryBar summary={computeRiskSummary(checks)} />
        </div>
      )}

      {checks.length === 0 ? (
        <p className="mt-8 text-[13px] text-[var(--color-muted)] italic">
          아직 점검 결과가 없습니다.
        </p>
      ) : (
        <div className="mt-6 flex flex-wrap items-start gap-4">
          <div className="min-w-[320px] max-w-[420px] flex-1 overflow-hidden rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)]">
            <div className="border-b border-[var(--color-border)] p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-[13px] font-bold">점검 항목</span>
                <span className="font-mono text-xs text-[var(--color-muted)]">
                  {filtered.length}건 표시
                </span>
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
            </div>
            <div className="max-h-[560px] overflow-auto">
              {filtered.map((check) => {
                const isSelected = check.id === selected?.id;
                return (
                  <button
                    key={check.id}
                    onClick={() => setSelectedId(check.id)}
                    className={`block w-full border-b border-[var(--color-border)] px-3.5 py-2.5 text-left last:border-0 ${
                      isSelected ? "bg-[var(--color-surface)]" : "hover:bg-[var(--color-surface)]"
                    }`}
                    style={isSelected ? { borderLeft: "3px solid var(--color-primary)" } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                        {check.id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[check.status]}`}
                      >
                        {CHECK_STATUS_LABELS[check.status]}
                      </span>
                      {check.severity && (
                        <span
                          className={`ml-auto rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold ${SEVERITY_STYLES[check.severity]}`}
                        >
                          {check.severity}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[13px]">{check.title}</div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="p-3.5 text-[13px] text-[var(--color-muted)] italic">
                  조건에 맞는 항목이 없습니다.
                </p>
              )}
            </div>
          </div>

          {selected && (
            <div className="min-w-[360px] flex-[2] rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
              <div className="font-mono text-[11px] text-[var(--color-muted)]">
                이력 / {getRepoDisplayName(run.repoUrl)} / {CATEGORY_CHIP_LABELS[selected.category ?? "container"]}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-[26px] font-extrabold tracking-tight">{selected.id}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${STATUS_STYLES[selected.status]}`}
                >
                  {CHECK_STATUS_LABELS[selected.status]}
                </span>
                {selected.severity && (
                  <span
                    className={`rounded-[6px] px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLES[selected.severity]}`}
                  >
                    {selected.severity}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLES[selected.source]}`}
                >
                  {SOURCE_LABELS[selected.source]}
                </span>
              </div>
              <h2 className="mt-2.5 text-[19px] leading-snug font-bold">{selected.title}</h2>

              <div className="mt-5">
                <div className="mb-1.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                  {selected.reason
                    ? selected.source === "ai"
                      ? "AI 분석 근거"
                      : "룰 기반 판단 근거"
                    : "설명"}
                </div>
                <p className="text-sm leading-relaxed">
                  {selected.reason ?? "아직 분석되지 않았습니다."}
                </p>
              </div>

              <div className="mt-4.5">
                <div className="mb-1.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                  근거 · Evidence
                </div>
                <pre className="overflow-x-auto rounded-[var(--radius-nh)] border border-[#1E293B] bg-[#0B1220] p-3 font-mono text-xs whitespace-pre-wrap text-[#CBD5E1]">
                  {selected.evidence}
                </pre>
              </div>

              {selected.remediation && (
                <div className="mt-4.5">
                  <div className="mb-1.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                    조치방안
                  </div>
                  <p className="text-sm leading-relaxed">{selected.remediation}</p>
                </div>
              )}

              {selected.example && (
                <div className="mt-4.5">
                  <div className="mb-1.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                    설정 예시
                  </div>
                  <pre className="overflow-x-auto rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs whitespace-pre-wrap">
                    {selected.example}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
