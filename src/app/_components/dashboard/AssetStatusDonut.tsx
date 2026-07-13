"use client";

import { computeDonutArcs } from "@/lib/dashboard/donutGeometry";
import type { DonutBucket, DonutBucketKey } from "@/lib/dashboard/statusDistribution";
import { CountUp, useCountUp } from "../CountUp";

// 상태색은 기존 시맨틱 토큰 재사용. 식별은 색 단독이 아니라
// 범례 텍스트(라벨+건수)와 세그먼트 <title> 툴팁이 함께 담당한다 (dataviz).
const BUCKET_COLOR: Record<DonutBucketKey, string> = {
  pass: "var(--color-pass)",
  review: "var(--color-review)",
  fail: "var(--color-fail)",
  running: "var(--color-primary)",
  unchecked: "var(--color-neutral)",
};

export function AssetStatusDonut({ buckets, total }: { buckets: DonutBucket[]; total: number }) {
  const arcs = computeDonutArcs(
    buckets.map((b) => ({ key: b.key, value: b.count })),
    { cx: 80, cy: 80, rOuter: 76, rInner: 52 },
  );
  const bucketByKey = new Map(buckets.map((b) => [b.key, b]));
  // 중앙 총계는 카운트업하되, 텍스트 자체는 정지(펼침 회전은 세그먼트 <g>에만 적용).
  const animatedTotal = useCountUp(total);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-[140px] w-[140px] shrink-0" role="img" aria-label="자산 상태 분포">
        {/* 세그먼트만 펼침 애니메이션 — 중앙 텍스트는 이 그룹 밖에 둬서 회전하지 않는다. */}
        <g className="animate-donut-unfurl">
          {arcs.map((arc) => {
            const bucket = bucketByKey.get(arc.key as DonutBucketKey)!;
            return (
              <path key={arc.key} d={arc.d} fill={BUCKET_COLOR[bucket.key]}>
                <title>{`${bucket.label} ${bucket.count}개`}</title>
              </path>
            );
          })}
        </g>
        <text x={80} y={78} textAnchor="middle" className="fill-text" fontSize={28} fontWeight={700}>
          {animatedTotal.toLocaleString()}
        </text>
        <text x={80} y={98} textAnchor="middle" className="fill-muted" fontSize={12}>
          자산
        </text>
      </svg>
      <ul className="flex min-w-[120px] flex-1 flex-col gap-1.5 text-[13px]">
        {buckets.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: BUCKET_COLOR[b.key] }} />
            <span>{b.label}</span>
            <CountUp value={b.count} className="ml-auto font-mono font-semibold" />
          </li>
        ))}
      </ul>
    </div>
  );
}
