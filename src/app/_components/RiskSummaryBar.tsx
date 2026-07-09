import type { RiskSummary } from "@/lib/checks/riskSummary";

const SEVERITY_CARDS: {
  key: "Critical" | "High" | "Medium" | "Low";
  ko: string;
  textClass: string;
  borderClass: string;
}[] = [
  { key: "Critical", ko: "심각", textClass: "text-fail", borderClass: "border-l-fail" },
  { key: "High", ko: "높음", textClass: "text-review", borderClass: "border-l-review" },
  { key: "Medium", ko: "중간", textClass: "text-secondary", borderClass: "border-l-secondary" },
  { key: "Low", ko: "낮음", textClass: "text-neutral", borderClass: "border-l-neutral" },
];

const STATUS_SEGMENTS: {
  key: "pass" | "fail" | "review" | "skip";
  label: string;
  bgClass: string;
}[] = [
  { key: "pass", label: "PASS", bgClass: "bg-pass" },
  { key: "fail", label: "FAIL", bgClass: "bg-fail" },
  { key: "review", label: "REVIEW", bgClass: "bg-review" },
  { key: "skip", label: "SKIP", bgClass: "bg-neutral" },
];

export function RiskSummaryBar({ summary }: { summary: RiskSummary }) {
  const shownTotal =
    summary.statusCounts.pass +
    summary.statusCounts.fail +
    summary.statusCounts.review +
    summary.statusCounts.skip;

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-text">
        보안 위험 요약
        <span className="font-mono text-xs font-normal text-muted">
          · 총 {summary.total}개 항목
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex gap-2">
          {SEVERITY_CARDS.map((card) => (
            <div
              key={card.key}
              className={`min-w-[84px] rounded-lg border border-l-[3px] border-border bg-bg py-1.5 pr-3 pl-2.5 ${card.borderClass}`}
            >
              <div className={`font-mono text-[20px] leading-none font-extrabold ${card.textClass}`}>
                {summary.severityCounts[card.key]}
              </div>
              <div className="text-[11px] text-muted">
                {card.key} · {card.ko}
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col justify-center gap-2">
          <div className="flex h-2.5 overflow-hidden rounded-full border border-border">
            {STATUS_SEGMENTS.map((seg) => (
              <div
                key={seg.key}
                className={seg.bgClass}
                style={{
                  width: shownTotal ? `${(summary.statusCounts[seg.key] / shownTotal) * 100}%` : 0,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {STATUS_SEGMENTS.map((seg) => (
              <span
                key={seg.key}
                className="inline-flex items-center gap-1.5 text-xs text-muted"
              >
                <span className={`h-[9px] w-[9px] rounded-sm ${seg.bgClass}`} />
                <span className="font-mono tracking-wide">{seg.label}</span>
                <b className="text-text">{summary.statusCounts[seg.key]}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
