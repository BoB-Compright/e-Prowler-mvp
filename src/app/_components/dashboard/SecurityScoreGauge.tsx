import { gaugeArcPath } from "@/lib/dashboard/donutGeometry";
import type { ScoreGrade } from "@/lib/dashboard/securityScore";

const TAU = Math.PI * 2;
const START = -TAU / 3; // -120° (8시 방향)
const SWEEP = (TAU * 2) / 3; // 240° 스윕

// 점수 텍스트는 text 토큰, 상태색은 아크와 칩에만 (dataviz: 텍스트에 시리즈색 금지)
const GRADE_META: Record<ScoreGrade, { label: string; color: string }> = {
  safe: { label: "안전", color: "var(--color-pass)" },
  caution: { label: "주의", color: "var(--color-review)" },
  warning: { label: "경고", color: "var(--color-warn)" },
  danger: { label: "위험", color: "var(--color-fail)" },
};

export function SecurityScoreGauge({ score, grade }: { score: number; grade: ScoreGrade }) {
  const meta = GRADE_META[grade];
  const fraction = Math.max(0, Math.min(1, score / 100));
  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 200 150"
        className="w-full max-w-[220px]"
        role="img"
        aria-label={`종합 보안 점수 ${score}점 (100점 만점), ${meta.label}`}
      >
        <path
          d={gaugeArcPath(100, 90, 78, START, START + SWEEP)}
          fill="none" stroke="var(--color-border)" strokeWidth={14} strokeLinecap="round"
        />
        {fraction > 0 && (
          <path
            d={gaugeArcPath(100, 90, 78, START, START + SWEEP * fraction)}
            fill="none" stroke={meta.color} strokeWidth={14} strokeLinecap="round"
            pathLength={1}
            className="animate-gauge-draw"
          />
        )}
        <text x={100} y={92} textAnchor="middle" className="fill-text" fontSize={40} fontWeight={700}>
          {score}
        </text>
        <text x={100} y={114} textAnchor="middle" className="fill-muted" fontSize={13}>
          /100
        </text>
      </svg>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </span>
    </div>
  );
}
