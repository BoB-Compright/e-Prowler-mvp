"use client";

import { useState } from "react";
import type { CveMatch } from "@/lib/cve/store";
import { Card } from "../../_components/Card";
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

export function CveList({ matches: initialMatches }: { matches: CveMatch[] }) {
  const [matches, setMatches] = useState(initialMatches);
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

  return (
    <Card title={`감지된 CVE (${active.length})`}>
      {error && <p className="mb-3 text-[13px] text-fail">{error}</p>}
      {active.length === 0 ? (
        <p className="text-[13px] text-muted">감지된 CVE가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {active.map((m) => (
            <li key={m.id} className="rounded-lg border border-border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-bold">{m.cveId}</span>
                  <StatusBadge status={SEVERITY_STATUS[m.severity]}>
                    {SEVERITY_LABEL[m.severity]}
                  </StatusBadge>
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
        </ul>
      )}
      {dismissed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] text-muted">
            무시된 CVE {dismissed.length}건
          </summary>
          <ul className="mt-2 divide-y divide-border text-[13px] text-muted">
            {dismissed.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span className="font-mono">
                  {m.cveId} · {m.packageName} {m.packageVersion}
                </span>
                <button onClick={() => toggleDismissed(m.id, false)} className="text-primary underline">
                  복원
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
