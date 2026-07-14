"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FeedRow } from "@/lib/cve/feedStore";
import type { CveSeverity } from "@/lib/cve/nvdClient";
import { applyCveFilter, SEVERITY_LABEL } from "@/lib/cve/feedFilter";
import { Card } from "../_components/Card";
import { SectionLabel } from "../_components/SectionLabel";
import { StatusBadge } from "../_components/StatusBadge";
import type { BadgeStatus } from "../_components/statusBadgeStyles";
import { CountUp } from "../_components/CountUp";

const SEVERITY_STATUS: Record<CveSeverity, BadgeStatus> = {
  critical: "fail", high: "fail", medium: "review", low: "neutral", unknown: "neutral",
};

// feedStore.actionRequired과 동일 로직을 로컬에 둔다: feedStore.ts는 better-sqlite3(@/lib/db)를
// 최상위에서 import하므로, 클라이언트 컴포넌트에서 값으로 import하면 서버 전용 모듈이
// 브라우저 번들에 딸려 들어가 next build가 깨진다(fs 모듈 미해결). 타입(FeedRow)만 import한다.
function actionRequired(assetMatches: number): boolean {
  return assetMatches > 0;
}

export function CveFeedView({ feed, initialLastScan }: { feed: FeedRow[]; initialLastScan: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "actionable">("all");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // cve_id → 한국어 설명. 마운트 후 /api/cve/translate로 채워 영문 위에 덮어쓴다.
  const [ko, setKo] = useState<Record<string, string>>({});

  // 보이는 행의 설명을 번역 요청(캐시 우선, AI 토글 ON이면 미스도 번역).
  useEffect(() => {
    if (feed.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cve/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: feed.map((f) => ({ cveId: f.cveId, summary: f.summary })) }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setKo(data.translations ?? {});
      } catch {
        // 번역 실패 시 영문 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feed]);

  const filtered = useMemo(() => applyCveFilter(feed, mode, query, ko), [feed, mode, query, ko]);

  const collectedToday = feed.length;
  const newCritical = feed.filter((c) => c.severity === "critical").length;
  const assetMatched = feed.filter((c) => c.assetMatches > 0).length;

  async function runScan() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/cve/scan", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setScanError(d.error ?? "스캔 실패");
        return;
      }
      router.refresh();
    } catch {
      setScanError("서버 연결 실패");
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-bold tracking-[-0.02em]">CVE 피드</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fail/10 px-2.5 py-1 text-[11px] font-semibold text-fail">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fail opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-fail" />
              </span>
              LIVE
            </span>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            NVD 피드 실시간 수집 중 — 공개된 CVE를 우리 자산과 즉시 대조해 조치 대상만 골라냅니다.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-[12px] text-muted">마지막 스캔 {initialLastScan}</span>
          {scanError && <span className="text-[11px] text-fail">{scanError}</span>}
          <button
            onClick={runScan}
            disabled={scanning}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? "자산 대조 중…" : "스캔 실행"}
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <SectionLabel>수집 CVE</SectionLabel>
          <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]"><CountUp value={collectedToday} /></div>
          <div className="mt-1 text-[13px] text-muted">최근 14일간 수집된 전체 CVE</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <SectionLabel>긴급(Critical)</SectionLabel>
          <div className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${newCritical > 0 ? "text-fail" : ""}`}><CountUp value={newCritical} /></div>
          <div className="mt-1 text-[13px] text-muted">CVSS 9.0 이상 최고 위험 등급</div>
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-pressed={mode === "actionable"}
          onClick={() => setMode("actionable")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setMode("actionable");
            }
          }}
          className={`cursor-pointer rounded-2xl border bg-surface p-5 transition-colors ${
            mode === "actionable" ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"
          }`}
        >
          <SectionLabel>조치 대상</SectionLabel>
          <div className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${assetMatched > 0 ? "text-fail" : ""}`}><CountUp value={assetMatched} /></div>
          <div className="mt-1 text-[13px] text-muted">보유 자산에서 영향이 확인된 CVE</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="CVE ID · 설명 · 심각도로 검색"
          className="w-full max-w-md rounded-lg border border-border bg-surface px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            aria-pressed={mode === "all"}
            onClick={() => setMode("all")}
            className={`px-3.5 py-2 text-[13px] font-semibold ${mode === "all" ? "bg-primary text-white" : "text-muted hover:bg-bg"}`}
          >
            전체
          </button>
          <button
            type="button"
            aria-pressed={mode === "actionable"}
            onClick={() => setMode("actionable")}
            className={`px-3.5 py-2 text-[13px] font-semibold ${mode === "actionable" ? "bg-primary text-white" : "text-muted hover:bg-bg"}`}
          >
            조치 대상만
          </button>
        </div>
      </div>

      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3"><SectionLabel>수집 시각</SectionLabel></th>
                <th className="px-4 py-3"><SectionLabel>등록일자</SectionLabel></th>
                <th className="px-4 py-3"><SectionLabel>심각도</SectionLabel></th>
                <th className="px-4 py-3"><SectionLabel>CVE</SectionLabel></th>
                <th className="px-4 py-3"><SectionLabel>설명</SectionLabel></th>
                <th className="px-4 py-3 text-center"><SectionLabel>CVSS</SectionLabel></th>
                <th className="px-4 py-3"><SectionLabel>자산 영향</SectionLabel></th>
                <th className="px-4 py-3"><SectionLabel>점검 결과</SectionLabel></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const matched = c.assetMatches > 0;
                const needsAction = actionRequired(c.assetMatches);
                return (
                  <tr key={c.cveId} className="hover:bg-bg">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{c.collectedLabel}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[13px] text-muted">{c.publishedAt ? c.publishedAt.slice(0, 10) : "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={SEVERITY_STATUS[c.severity]}>{SEVERITY_LABEL[c.severity]}</StatusBadge></td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[13px] font-bold">
                      {c.assetMatches > 0 ? (
                        <Link href={`/cve/${c.cveId}`} className="text-primary hover:underline">
                          {c.cveId}
                        </Link>
                      ) : (
                        c.cveId
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[220px]">{ko[c.cveId] ?? c.summary}</td>
                    <td className="px-4 py-3 text-center font-mono text-[13px] font-bold">{c.cvssScore != null ? c.cvssScore.toFixed(1) : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={matched ? "fail" : "neutral"}>{matched ? `${c.assetMatches}대 매칭` : "영향 없음"}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={needsAction ? "fail" : "pass"}>{needsAction ? "조치 필요" : "해당 없음"}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {feed.length === 0 && (
          <p className="p-5 text-[13px] text-muted italic">아직 수집된 CVE가 없습니다. &quot;스캔 실행&quot;으로 NVD 피드를 수집하세요.</p>
        )}
        {feed.length > 0 && filtered.length === 0 && mode === "actionable" && query.trim() === "" && (
          <p className="p-5 text-[13px] text-muted italic">조치가 필요한 CVE가 없습니다 — 보유 자산에 영향을 주는 CVE가 아직 없습니다.</p>
        )}
        {feed.length > 0 && filtered.length === 0 && !(mode === "actionable" && query.trim() === "") && (
          <p className="p-5 text-[13px] text-muted italic">검색 조건에 맞는 CVE가 없습니다.</p>
        )}
      </Card>
    </main>
  );
}
