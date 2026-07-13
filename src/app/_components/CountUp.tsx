"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// 마운트 시 0 → target으로 빠르게 증가(ease-out). 큰 수도 같은 시간에 도달하므로
// 1843 같은 값은 자연히 빠르게 올라간다. reduced-motion이면 즉시 목표값.
// SSR/hydration 안전: 서버·클라 초기값 모두 0에서 시작해 마운트 후 애니메이션.
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // reduced-motion이면 첫 프레임에 목표값으로 점프(특수 분기 없이 동일 루프 사용 →
    // effect 본문에서 동기 setState 하지 않는다).
    const reduce = prefersReducedMotion() || durationMs <= 0;
    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const p = reduce ? 1 : Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setValue(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

// KPI 타일 등 HTML 숫자용. 천단위 콤마 포맷.
export function CountUp({ value, className }: { value: number; className?: string }) {
  const n = useCountUp(value);
  return <span className={className}>{n.toLocaleString()}</span>;
}
