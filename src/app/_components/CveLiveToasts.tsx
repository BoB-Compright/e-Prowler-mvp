"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./StatusBadge";
import type { BadgeStatus } from "./statusBadgeStyles";

type Severity = "critical" | "high" | "medium" | "low" | "unknown";
interface Match {
  cveId: string;
  severity: Severity;
  summary: string;
  assetMatches: number;
  firstSeenAt: string;
}
interface Toast extends Match {
  key: string;
}

const SEVERITY_LABEL: Record<Severity, string> = { critical: "심각", high: "높음", medium: "중간", low: "낮음", unknown: "미상" };
const SEVERITY_STATUS: Record<Severity, BadgeStatus> = { critical: "fail", high: "fail", medium: "review", low: "neutral", unknown: "neutral" };

const SINCE_KEY = "nhg_cve_toast_since";
const POLL_MS = 30_000;
const MAX_VISIBLE = 4;
const DISMISS_MS = 6_000;

// 새로 자산에 매칭된 CVE를 우하단 토스트로 알린다. 30초 폴링 + localStorage
// last-seen(첫 방문 now 초기화 → 과거 폭주 방지). 성공 응답에서만 since 전진하고,
// 표시한 cveId는 seen Set으로 중복 억제. 폴링 실패는 조용히 무시.
export function CveLiveToasts() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const counterRef = useRef(0);

  useEffect(() => {
    if (!localStorage.getItem(SINCE_KEY)) {
      localStorage.setItem(SINCE_KEY, new Date().toISOString());
    }

    let cancelled = false;
    async function poll() {
      const since = localStorage.getItem(SINCE_KEY) ?? new Date().toISOString();
      try {
        const res = await fetch(`/api/cve/recent-matches?since=${encodeURIComponent(since)}`);
        if (!res.ok) return;
        const data: { matches: Match[] } = await res.json();
        if (cancelled || !data.matches?.length) return;
        const fresh = data.matches.filter((m) => !seenRef.current.has(m.cveId));
        if (fresh.length === 0) return;
        fresh.forEach((m) => seenRef.current.add(m.cveId));
        // 최신 firstSeenAt로 since 전진
        const newest = data.matches.reduce((a, b) => (a.firstSeenAt > b.firstSeenAt ? a : b));
        localStorage.setItem(SINCE_KEY, newest.firstSeenAt);
        setToasts((prev) => {
          const added = fresh.map((m) => ({ ...m, key: `${m.cveId}-${counterRef.current++}` }));
          return [...added, ...prev].slice(0, MAX_VISIBLE);
        });
      } catch {
        // 네트워크/인증 실패 무시
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // 각 토스트 자동 소멸
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.key !== t.key)), DISMISS_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.key}
          onClick={() => router.push("/cve")}
          className="animate-toast-in rounded-xl border border-border bg-surface p-3.5 text-left shadow-lg hover:bg-bg"
        >
          <div className="flex items-center gap-2">
            <StatusBadge status={SEVERITY_STATUS[t.severity]}>{SEVERITY_LABEL[t.severity]}</StatusBadge>
            <span className="font-mono text-[13px] font-bold">{t.cveId}</span>
            <span className="ml-auto text-[11px] text-muted">{t.assetMatches}대 매칭</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted">{t.summary}</p>
        </button>
      ))}
    </div>
  );
}
