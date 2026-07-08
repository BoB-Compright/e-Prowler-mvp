import type { RiskSummary } from "@/lib/checks/riskSummary";

const SEVERITY_CARDS: { key: "Critical" | "High" | "Medium" | "Low"; ko: string; color: string }[] = [
  { key: "Critical", ko: "심각", color: "var(--color-fail)" },
  { key: "High", ko: "높음", color: "var(--color-review)" },
  { key: "Medium", ko: "중간", color: "var(--color-secondary)" },
  { key: "Low", ko: "낮음", color: "var(--color-neutral)" },
];

const STATUS_SEGMENTS: { key: "pass" | "fail" | "review" | "skip"; label: string; color: string }[] = [
  { key: "pass", label: "PASS", color: "var(--color-pass)" },
  { key: "fail", label: "FAIL", color: "var(--color-fail)" },
  { key: "review", label: "REVIEW", color: "var(--color-review)" },
  { key: "skip", label: "SKIP", color: "var(--color-neutral)" },
];

export function RiskSummaryBar({ summary }: { summary: RiskSummary }) {
  const shownTotal =
    summary.statusCounts.pass +
    summary.statusCounts.fail +
    summary.statusCounts.review +
    summary.statusCounts.skip;

  return (
    <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-[var(--color-text)]">
        보안 위험 요약
        <span className="font-mono text-xs font-normal text-[var(--color-muted)]">
          · 총 {summary.total}개 항목
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex gap-2">
          {SEVERITY_CARDS.map((card) => (
            <div
              key={card.key}
              className="min-w-[84px] rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pr-3 pl-2.5"
              style={{ borderLeft: `3px solid ${card.color}` }}
            >
              <div className="font-mono text-[20px] leading-none font-extrabold" style={{ color: card.color }}>
                {summary.severityCounts[card.key]}
              </div>
              <div className="text-[11px] text-[var(--color-muted)]">
                {card.key} · {card.ko}
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col justify-center gap-2">
          <div className="flex h-2.5 overflow-hidden rounded-[var(--radius-nh)] border border-[var(--color-border)]">
            {STATUS_SEGMENTS.map((seg) => (
              <div
                key={seg.key}
                style={{
                  width: shownTotal ? `${(summary.statusCounts[seg.key] / shownTotal) * 100}%` : 0,
                  background: seg.color,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {STATUS_SEGMENTS.map((seg) => (
              <span
                key={seg.key}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]"
              >
                <span
                  className="h-[9px] w-[9px] rounded-sm"
                  style={{ background: seg.color }}
                />
                <span className="font-mono tracking-wide">{seg.label}</span>
                <b className="text-[var(--color-text)]">{summary.statusCounts[seg.key]}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
