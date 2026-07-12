"use client";

import { useState } from "react";
import type { CveMatch } from "@/lib/cve/store";
import { StatusBadge } from "../../_components/StatusBadge";
import type { BadgeStatus } from "../../_components/statusBadgeStyles";

const SEVERITY_LABEL: Record<CveMatch["severity"], string> = {
  critical: "심각",
  high: "높음",
  medium: "중간",
  low: "낮음",
  unknown: "알수없음",
};

// severity → StatusBadge 매핑: critical/high는 fail, medium은 review, low/unknown은 neutral.
const SEVERITY_STATUS: Record<CveMatch["severity"], BadgeStatus> = {
  critical: "fail",
  high: "fail",
  medium: "review",
  low: "neutral",
  unknown: "neutral",
};

const SEVERITY_ORDER: CveMatch["severity"][] = ["critical", "high", "medium", "low", "unknown"];

// CVE가 수천 건일 수 있어 전부 DOM에 올리지 않는다 — 처음 INITIAL_VISIBLE건만
// 렌더하고 "더 보기"로 VISIBLE_STEP씩 늘린다. 목록 자체도 높이를 제한해
// 아래 콘텐츠(점검 리포트 등)가 밀려나지 않게 한다.
const INITIAL_VISIBLE = 20;
const VISIBLE_STEP = 50;

function SeverityCountChips({ matches }: { matches: CveMatch[] }) {
  const counts = new Map<CveMatch["severity"], number>();
  for (const m of matches) counts.set(m.severity, (counts.get(m.severity) ?? 0) + 1);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {SEVERITY_ORDER.filter((s) => counts.get(s)).map((s) => (
        <StatusBadge key={s} status={SEVERITY_STATUS[s]}>
          {SEVERITY_LABEL[s]} {counts.get(s)!.toLocaleString()}
        </StatusBadge>
      ))}
    </span>
  );
}

// defaultOpen=false면 접힌 상태로 시작한다(런 리포트처럼 CVE가 보조 정보인
// 화면용). 헤더(건수 + 심각도별 칩)는 접혀 있어도 항상 보인다.
export function CveList({
  matches: initialMatches,
  defaultOpen = true,
}: {
  matches: CveMatch[];
  defaultOpen?: boolean;
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [error, setError] = useState<string | null>(null);

  async function toggleDismissed(id: string, dismissed: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/cve-matches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed }),
      });
      if (!res.ok) {
        setError("변경 사항을 저장하지 못했습니다");
        return;
      }
      setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, dismissed } : m)));
    } catch {
      setError("서버에 연결할 수 없습니다");
    }
  }

  const active = matches.filter((m) => !m.dismissed);
  const dismissed = matches.filter((m) => m.dismissed);
  const visible = active.slice(0, visibleCount);
  const remaining = active.length - visible.length;

  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-border bg-surface"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="flex-none text-muted transition-transform group-open:rotate-90"
          aria-hidden
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h3 className="text-[15px] font-semibold">
          감지된 CVE ({active.length.toLocaleString()})
        </h3>
        <SeverityCountChips matches={active} />
        <span className="ml-auto text-xs text-muted group-open:hidden">펼쳐서 최신순 목록 보기</span>
      </summary>

      <div className="border-t border-border p-5">
        {error && <p className="mb-3 text-[13px] text-fail">{error}</p>}
        {active.length === 0 ? (
          <p className="text-[13px] text-muted">감지된 CVE가 없습니다.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              최신 발표순 · {visible.length.toLocaleString()}건 표시 / 전체 {active.length.toLocaleString()}건
            </p>
            <ul className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {visible.map((m) => (
                <li key={m.id} className="rounded-lg border border-border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-bold">{m.cveId}</span>
                      <StatusBadge status={SEVERITY_STATUS[m.severity]}>
                        {SEVERITY_LABEL[m.severity]}
                      </StatusBadge>
                      {m.publishedAt && (
                        <span className="text-[11px] text-muted">
                          발표 {m.publishedAt.slice(0, 10)}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[13px] text-muted">
                      {m.packageName} {m.packageVersion}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-muted">{m.summary}</p>
                  {m.aiImpact && <p className="mt-1 text-[13px]">영향: {m.aiImpact}</p>}
                  {m.aiRemediation && <p className="mt-1 text-[13px]">조치: {m.aiRemediation}</p>}
                  <button
                    onClick={() => toggleDismissed(m.id, true)}
                    className="mt-3 rounded-lg border border-border px-3 py-1 text-[13px] hover:bg-bg"
                  >
                    무시
                  </button>
                </li>
              ))}
              {remaining > 0 && (
                <li>
                  <button
                    onClick={() => setVisibleCount((n) => n + VISIBLE_STEP)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-[13px] text-muted hover:bg-bg"
                  >
                    더 보기 ({remaining.toLocaleString()}건 남음)
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
        {dismissed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-[13px] text-muted">
              무시된 CVE {dismissed.length.toLocaleString()}건
            </summary>
            <ul className="mt-2 max-h-[240px] divide-y divide-border overflow-y-auto text-[13px] text-muted">
              {dismissed.slice(0, 100).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span className="font-mono">
                    {m.cveId} · {m.packageName} {m.packageVersion}
                  </span>
                  <button onClick={() => toggleDismissed(m.id, false)} className="text-primary underline">
                    복원
                  </button>
                </li>
              ))}
              {dismissed.length > 100 && (
                <li className="py-2 text-xs italic">외 {(dismissed.length - 100).toLocaleString()}건 …</li>
              )}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}
