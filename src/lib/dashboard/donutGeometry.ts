// SVG 좌표계: 각도 0 = 12시 방향, 시계 방향으로 증가 (라디안).
const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

// 도넛 링 세그먼트(fill용): 외곽 아크 → 내곽 아크 역방향으로 닫는다.
export function donutSegmentPath(
  cx: number, cy: number, rOuter: number, rInner: number,
  start: number, end: number,
): string {
  const [x0, y0] = polar(cx, cy, rOuter, start);
  const [x1, y1] = polar(cx, cy, rOuter, end);
  const [x2, y2] = polar(cx, cy, rInner, end);
  const [x3, y3] = polar(cx, cy, rInner, start);
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${x0} ${y0}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3}`,
    "Z",
  ].join(" ");
}

// 게이지(stroke용) 아크 — strokeLinecap="round"와 함께 쓴다.
export function gaugeArcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x0, y0] = polar(cx, cy, r, start);
  const [x1, y1] = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export interface DonutArcOptions {
  cx: number;
  cy: number;
  rOuter: number;
  rInner: number;
  padAngle?: number; // 세그먼트 사이 표면 간격(라디안). 기본 0.04 ≈ 반경 76px에서 ~3px
}

export function computeDonutArcs(
  slices: { key: string; value: number }[],
  { cx, cy, rOuter, rInner, padAngle = 0.04 }: DonutArcOptions,
): { key: string; d: string }[] {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];
  const nonzeroCount = slices.filter((s) => s.value > 0).length;
  const pad = nonzeroCount > 1 ? padAngle : 0; // 단일 세그먼트엔 간격 불필요

  let cursor = 0;
  const arcs: { key: string; d: string }[] = [];
  for (const slice of slices) {
    if (slice.value <= 0) continue;
    const sweep = (slice.value / total) * TAU;
    const start = cursor + pad / 2;
    // 100% 단일 세그먼트에서 시작점==끝점이 되면 아크가 사라지므로 TAU 직전으로 클램프
    const end = Math.min(cursor + sweep - pad / 2, start + TAU - 0.001);
    if (end > start) arcs.push({ key: slice.key, d: donutSegmentPath(cx, cy, rOuter, rInner, start, end) });
    cursor += sweep;
  }
  return arcs;
}
