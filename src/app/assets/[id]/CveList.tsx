"use client";

import { useState } from "react";
import type { CveMatch } from "@/lib/cve/store";

const SEVERITY_LABEL: Record<CveMatch["severity"], string> = {
  critical: "심각",
  high: "높음",
  medium: "중간",
  low: "낮음",
  unknown: "알수없음",
};

export function CveList({ matches: initialMatches }: { matches: CveMatch[] }) {
  const [matches, setMatches] = useState(initialMatches);

  async function toggleDismissed(id: string, dismissed: boolean) {
    await fetch(`/api/cve-matches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed }),
    });
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, dismissed } : m)));
  }

  const active = matches.filter((m) => !m.dismissed);
  const dismissed = matches.filter((m) => m.dismissed);

  return (
    <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-4">
      <h2 className="mb-3 text-sm font-bold">감지된 CVE</h2>
      {active.length === 0 && (
        <p className="text-xs text-[var(--color-muted)]">감지된 CVE가 없습니다.</p>
      )}
      <ul className="space-y-2 text-sm">
        {active.map((m) => (
          <li key={m.id} className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold">{m.cveId}</span>
              <span className="text-xs text-[var(--color-muted)]">
                {SEVERITY_LABEL[m.severity]} · {m.packageName} {m.packageVersion}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">{m.summary}</p>
            {m.aiImpact && <p className="mt-1 text-xs">영향: {m.aiImpact}</p>}
            {m.aiRemediation && <p className="mt-1 text-xs">조치: {m.aiRemediation}</p>}
            <button
              onClick={() => toggleDismissed(m.id, true)}
              className="mt-2 rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-0.5 text-xs"
            >
              무시
            </button>
          </li>
        ))}
      </ul>
      {dismissed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-[var(--color-muted)]">
            무시된 CVE {dismissed.length}건
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">
            {dismissed.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span>
                  {m.cveId} · {m.packageName} {m.packageVersion}
                </span>
                <button onClick={() => toggleDismissed(m.id, false)} className="underline">
                  복원
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
