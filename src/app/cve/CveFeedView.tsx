"use client";

import { useMemo, useState } from "react";
import type { DemoFeedCve, DemoSeverity } from "@/lib/cve/demoFeed";
import { actionRequired } from "@/lib/cve/demoFeed";
import { Card } from "../_components/Card";
import { SectionLabel } from "../_components/SectionLabel";
import { StatusBadge } from "../_components/StatusBadge";
import type { BadgeStatus } from "../_components/statusBadgeStyles";

// 값 기반 색 매핑(하드코딩 금지 원칙): 심각도·자산영향·점검결과는 모두 값에서 색을 파생한다.
const SEVERITY_LABEL: Record<DemoSeverity, string> = { Critical: "심각", High: "높음", Medium: "중간" };
const SEVERITY_STATUS: Record<DemoSeverity, BadgeStatus> = {
  Critical: "fail", // CVSS 9.0+
  High: "fail", // 7.0~8.9
  Medium: "review", // 4.0~6.9
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function formatNow(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function CveFeedView({ feed }: { feed: DemoFeedCve[] }) {
  const [query, setQuery] = useState("");
  // 자산 재대조가 마지막으로 돌아간 시점(매칭 신뢰도의 기준). "스캔 실행"이 갱신한다.
  const [lastScan, setLastScan] = useState("2026-07-08 03:12");
  const [scanning, setScanning] = useState(false);

  // 정렬 기준은 등록일이 아니라 수집 시각(최근 유입 우선)이다 — 오래된 CVE라도
  // 방금 재수집됐으면 위로 온다.
  const sorted = useMemo(
    () => [...feed].sort((a, b) => a.collectedMinutesAgo - b.collectedMinutesAgo),
    [feed],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) =>
      [c.cveId, c.description, c.severity, SEVERITY_LABEL[c.severity]]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [sorted, query]);

  // 상단 통계: 노이즈 총량 → 잠재적 큰불 → 실제 오늘 할 일. 데이터에서 파생한다.
  const collectedToday = feed.length;
  const newCritical = feed.filter((c) => c.severity === "Critical").length;
  const assetMatched = feed.filter((c) => c.assetMatches > 0).length;

  async function runScan() {
    setScanning(true);
    // 시연: 자산 재대조를 트리거하는 자리. 지금은 마지막 스캔 시각만 갱신한다.
    await new Promise((r) => setTimeout(r, 600));
    setLastScan(formatNow(new Date()));
    setScanning(false);
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
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
          <span className="text-[12px] text-muted">마지막 스캔 {lastScan}</span>
          <button
            onClick={runScan}
            disabled={scanning}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? "자산 대조 중…" : "스캔 실행"}
          </button>
        </div>
      </div>

      <div className="mb-3">
        <span className="inline-block rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-muted">
          시연 데이터 — 실제 NVD 피드/자산 대조가 아닌 화면·판정 로직 예시입니다
        </span>
      </div>

      {/* 상단 통계 3개: 47건 왔지만 실제 우리 일은 N건이라는 필터링 효과를 한눈에. */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <SectionLabel>오늘 수집</SectionLabel>
          <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">{collectedToday}</div>
          <div className="mt-1 text-[13px] text-muted">피드로 들어온 전체 (노이즈 총량)</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <SectionLabel>신규 Critical</SectionLabel>
          <div className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${newCritical > 0 ? "text-fail" : ""}`}>
            {newCritical}
          </div>
          <div className="mt-1 text-[13px] text-muted">최고 위험 등급 (잠재적 큰불)</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <SectionLabel>자산 매칭</SectionLabel>
          <div className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${assetMatched > 0 ? "text-fail" : ""}`}>
            {assetMatched}
          </div>
          <div className="mt-1 text-[13px] text-muted">우리 자산에 실제로 걸린 = 오늘 할 일</div>
        </div>
      </div>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="CVE ID · 설명 · 심각도로 검색"
          className="w-full max-w-md rounded-lg border border-border bg-surface px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
        />
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
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[13px] text-muted">{c.publishedDate}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={SEVERITY_STATUS[c.severity]}>{SEVERITY_LABEL[c.severity]}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[13px] font-bold">{c.cveId}</td>
                    <td className="px-4 py-3 min-w-[220px]">{c.description}</td>
                    <td className="px-4 py-3 text-center font-mono text-[13px] font-bold">{c.cvss.toFixed(1)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={matched ? "fail" : "neutral"}>
                        {matched ? `${c.assetMatches}대 매칭` : "영향 없음"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={needsAction ? "fail" : "pass"}>
                        {needsAction ? "조치 필요" : "해당 없음"}
                      </StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="p-5 text-[13px] text-muted italic">검색 조건에 맞는 CVE가 없습니다.</p>
        )}
      </Card>
    </main>
  );
}
