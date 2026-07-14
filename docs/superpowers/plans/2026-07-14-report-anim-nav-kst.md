# 리포트/CVE 애니메이션·숫자필터·사이드바 접기·KST Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CVE 피드·리포트 숫자 카운트업 + 리포트 막대 애니메이션 + 리포트 숫자 클릭 필터 + 사이드바 접기/펼치기 + 절대시각 KST 표시.

**Architecture:** 기존 CountUp(useCountUp) 재사용, RiskSummaryBar를 client로 전환해 카운트업+막대 그로우, ReportView 상단 카드 버튼화, 사이드바는 `<html data-nav-collapsed>` + CSS로 폭·본문여백 제어(ThemeScript 동형 사전 스크립트), KST는 formatKst 표시 유틸.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, vitest.

## Global Constraints

- 테스트/타입/린트는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 애니메이션·카운트업은 `prefers-reduced-motion: reduce` 존중(CountUp은 이미 처리).
- 저장 타임스탬프는 UTC ISO 유지 — **표시만 KST**. 상대시간 로직 불변.
- 사이드바 상태는 localStorage `nhg_nav_collapsed` + `<html data-nav-collapsed>`. SSR 초기 스냅샷=펼침.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build. 순수 유틸(formatKst)만 단위 테스트.

---

### Task 1: KST 표시 유틸 + 적용

**Files:**
- Create: `src/lib/time/kst.ts`
- Create: `src/lib/time/kst.test.ts`
- Modify: `src/app/runs/[id]/report/ReportView.tsx`, `src/app/share/[token]/ShareGate.tsx`, `src/app/cve/page.tsx`, `src/app/runs/page.tsx`, `src/app/runs/batch/[batchId]/page.tsx`, `src/app/assets/[id]/page.tsx`, `src/app/assets/[id]/ScheduleForm.tsx`

**Interfaces:**
- Produces: `formatKst(iso: string): string` — "YYYY-MM-DD HH:mm" (Asia/Seoul).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/time/kst.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatKst } from "./kst";

describe("formatKst", () => {
  it("converts UTC to KST (+9h)", () => {
    expect(formatKst("2026-07-14T00:00:00.000Z")).toBe("2026-07-14 09:00");
  });
  it("crosses the date boundary", () => {
    expect(formatKst("2026-07-13T15:30:00.000Z")).toBe("2026-07-14 00:30");
  });
  it("falls back to a sliced string for an invalid iso", () => {
    expect(formatKst("not-a-date")).toBe("not-a-date".replace("T", " ").slice(0, 16));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/time/kst.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/lib/time/kst.ts`:

```typescript
// 저장된 UTC ISO 문자열을 한국시간(Asia/Seoul) "YYYY-MM-DD HH:mm"로 표시용 변환한다.
// 저장값은 바꾸지 않는다(표시 전용). 잘못된 입력은 기존 슬라이스 폴백.
export function formatKst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ").slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
```

- [ ] **Step 4: 적용 — 각 파일의 절대시각 포맷터를 formatKst로 교체**

각 파일 상단에 `import { formatKst } from "@/lib/time/kst";` 추가하고 아래처럼 바꾼다(실제 코드 위치는 파일을
읽어 확인):

- `runs/[id]/report/ReportView.tsx`: 로컬 `function formatTimestamp(iso){ return iso.replace("T"," ").slice(0,16); }`
  를 제거하고 그 호출부를 `formatKst(...)`로 교체(또는 formatTimestamp 본문을 `return formatKst(iso);`로).
- `runs/page.tsx`·`runs/batch/[batchId]/page.tsx`·`assets/[id]/page.tsx`: 동일한 로컬 `formatTimestamp`
  본문을 `return formatKst(iso);`로 교체(간단·호출부 불변).
- `share/[token]/ShareGate.tsx`: 로컬 `formatTimestamp` 본문을 `return formatKst(iso);`로.
- `cve/page.tsx`: `const lastScan = watermark ? watermark.replace("T"," ").slice(0,16) : "아직 없음";`
  → `const lastScan = watermark ? formatKst(watermark) : "아직 없음";`.
- `assets/[id]/ScheduleForm.tsx`: `schedule.nextRunAt.replace("T"," ").slice(0,16)` 2곳(다음/마지막 실행)을
  `formatKst(schedule.nextRunAt)` / `formatKst(schedule.lastRunAt)`로.

- [ ] **Step 5: 테스트/타입/린트/빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/time/kst.test.ts && npx tsc --noEmit && npx eslint src/lib/time "src/app/runs/[id]/report/ReportView.tsx" "src/app/share/[token]/ShareGate.tsx" src/app/cve/page.tsx src/app/runs/page.tsx "src/app/runs/batch/[batchId]/page.tsx" "src/app/assets/[id]/page.tsx" "src/app/assets/[id]/ScheduleForm.tsx" && npx next build 2>&1 | tail -3`
Expected: PASS, 에러 없음, 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/time "src/app/runs/[id]/report/ReportView.tsx" "src/app/share/[token]/ShareGate.tsx" src/app/cve/page.tsx src/app/runs/page.tsx "src/app/runs/batch/[batchId]/page.tsx" "src/app/assets/[id]/page.tsx" "src/app/assets/[id]/ScheduleForm.tsx"
git commit -m "feat: 절대 시각 표시를 KST(Asia/Seoul)로 (formatKst, 저장은 UTC 유지)"
```

---

### Task 2: CVE 피드 통계 카운트업

**Files:**
- Modify: `src/app/cve/CveFeedView.tsx`

**Interfaces:** Consumes `CountUp`(@/app/_components/CountUp).

- [ ] **Step 1: CountUp 적용**

`src/app/cve/CveFeedView.tsx` 상단 import에 `import { CountUp } from "../_components/CountUp";` 추가.
3개 통계 숫자(현재 `{collectedToday}` / `{newCritical}` / `{assetMatched}`)를 각각
`<CountUp value={collectedToday} />` / `<CountUp value={newCritical} />` / `<CountUp value={assetMatched} />`로 교체.
(실제 파일에서 세 숫자의 `<div className="...text-[32px]...">{값}</div>` 위치를 읽어 정확히 교체.)

- [ ] **Step 2: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/cve/CveFeedView.tsx && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add src/app/cve/CveFeedView.tsx
git commit -m "feat: CVE 피드 통계(수집·긴급·조치 대상) 숫자 카운트업"
```

---

### Task 3: 리포트 숫자 카운트업 + RiskSummaryBar 애니메이션

**Files:**
- Modify: `src/app/runs/[id]/report/ReportView.tsx` (상단 4카드 숫자)
- Modify: `src/app/_components/RiskSummaryBar.tsx` (client 전환 + 카운트업 + 막대 그로우)

**Interfaces:** Consumes `CountUp`/`useCountUp`(@/app/_components/CountUp).

- [ ] **Step 1: ReportView 상단 4카드 카운트업**

`ReportView.tsx` 상단 import에 `import { CountUp } from "@/app/_components/CountUp";` 추가.
4카드 숫자를 교체: `{summary.total}`→`<CountUp value={summary.total} />`,
`{summary.statusCounts.pass}`→`<CountUp value={summary.statusCounts.pass} />`,
`.fail`·`.review`도 동일. (색상 클래스가 걸린 `<div>` 안의 숫자만 교체 — 클래스는 유지.)

- [ ] **Step 2: RiskSummaryBar client 전환 + 애니메이션**

`src/app/_components/RiskSummaryBar.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { RiskSummary } from "@/lib/checks/riskSummary";
import { CountUp } from "./CountUp";

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

  // 막대 세그먼트를 마운트 후 0→목표%로 그로우(빠르게 펼쳐지는 형태).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-text">
        보안 위험 요약
        <span className="font-mono text-xs font-normal text-muted">· 총 {summary.total}개 항목</span>
      </div>
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex gap-2">
          {SEVERITY_CARDS.map((card) => (
            <div
              key={card.key}
              className={`min-w-[84px] rounded-lg border border-l-[3px] border-border bg-bg py-1.5 pr-3 pl-2.5 ${card.borderClass}`}
            >
              <CountUp
                value={summary.severityCounts[card.key]}
                className={`block font-mono text-[20px] leading-none font-extrabold ${card.textClass}`}
              />
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
                className={`${seg.bgClass} transition-[width] duration-500 ease-out motion-reduce:transition-none`}
                style={{
                  width:
                    mounted && shownTotal
                      ? `${(summary.statusCounts[seg.key] / shownTotal) * 100}%`
                      : 0,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {STATUS_SEGMENTS.map((seg) => (
              <span key={seg.key} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span className={`h-[9px] w-[9px] rounded-sm ${seg.bgClass}`} />
                <span className="font-mono tracking-wide">{seg.label}</span>
                <CountUp value={summary.statusCounts[seg.key]} className="font-bold text-text" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/runs/[id]/report/ReportView.tsx" src/app/_components/RiskSummaryBar.tsx && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add "src/app/runs/[id]/report/ReportView.tsx" src/app/_components/RiskSummaryBar.tsx
git commit -m "feat: 리포트 요약 숫자 카운트업 + 위험요약 막대 그로우 애니메이션"
```

---

### Task 4: 리포트 상단 카드 클릭 → 상태 필터

**Files:**
- Modify: `src/app/runs/[id]/report/ReportView.tsx`

**Interfaces:** 기존 `statusFilter`/`setStatusFilter` 상태 재사용.

- [ ] **Step 1: 4카드를 필터 버튼으로**

상단 4카드(`<div className="rounded-2xl border border-border bg-surface p-5">...`)를 각각 `<button>`으로 바꾸고
`onClick`으로 `setStatusFilter`를 호출한다. 카드→필터 매핑: Total→`"all"`, Pass→`"pass"`, Fail→`"fail"`,
Review→`"review"`. 현재 필터와 일치하면 `border-primary` 강조(아니면 기존 `border-border`).

각 카드를 아래 형태로(색상 클래스·CountUp은 유지, wrapper를 button으로):

```tsx
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-2xl border bg-surface p-5 text-left transition-colors hover:border-primary/50 ${statusFilter === "all" ? "border-primary" : "border-border"}`}
            >
              <SectionLabel>Total Checks</SectionLabel>
              <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">
                <CountUp value={summary.total} />
              </div>
            </button>
```

Pass/Fail/Review 카드도 동일 패턴(각각 `setStatusFilter("pass"|"fail"|"review")`, 일치 비교값 동일,
숫자 색상 클래스 `text-pass`/`text-fail`/`text-review` 유지). 기존 `<div>` wrapper·`grid` 컨테이너는 유지.

- [ ] **Step 2: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/runs/[id]/report/ReportView.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add "src/app/runs/[id]/report/ReportView.tsx"
git commit -m "feat: 리포트 상단 요약 카드 클릭 시 해당 상태로 항목 필터"
```

---

### Task 5: 사이드바 접기/펼치기 + 헤더 제목 강조

**Files:**
- Create: `src/app/_components/NavCollapseScript.tsx`
- Modify: `src/app/_components/AppSidebar.tsx`
- Modify: `src/app/_components/AppHeader.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:** `<html data-nav-collapsed="1">` 속성 + localStorage `nhg_nav_collapsed`.

- [ ] **Step 1: 사전 스크립트(깜빡임 방지)**

`src/app/_components/NavCollapseScript.tsx` (ThemeScript 동형):

```tsx
const NAV_INIT_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem("nhg_nav_collapsed") === "1") {
      document.documentElement.dataset.navCollapsed = "1";
    }
  } catch (e) {}
})();
`;

export function NavCollapseScript() {
  return <script dangerouslySetInnerHTML={{ __html: NAV_INIT_SCRIPT }} />;
}
```

- [ ] **Step 2: layout.tsx 배선**

`src/app/layout.tsx`:
- import 추가: `import { NavCollapseScript } from "./_components/NavCollapseScript";`
- `<head>`에 `<ThemeScript />` 다음 줄 `<NavCollapseScript />` 추가.
- 본문 래퍼 div의 `className="flex min-h-screen flex-col md:pl-64"`를 `className="app-main flex min-h-screen flex-col"`로 교체(pl은 CSS가 제어).

- [ ] **Step 3: globals.css — 폭·여백 제어**

`src/app/globals.css` 끝에 추가:

```css
/* 사이드바 접기: html[data-nav-collapsed] 기준으로 폭·본문 여백 제어(레이아웃은 서버 컴포넌트). */
aside[data-app-sidebar] { transition: width 0.2s ease; }
@media (min-width: 768px) {
  .app-main { padding-left: 16rem; transition: padding-left 0.2s ease; }
  html[data-nav-collapsed="1"] .app-main { padding-left: 4rem; }
  html[data-nav-collapsed="1"] aside[data-app-sidebar] { width: 4rem; }
}
```

- [ ] **Step 4: AppSidebar — 토글 + 접힘 렌더**

`src/app/_components/AppSidebar.tsx` 전체를 아래로 교체:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { NAV_ITEMS, isActiveNav } from "./navItems";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { HelpButton } from "./onboarding/HelpButton";
import { LogoutButton } from "./LogoutButton";

const NAV_COLLAPSE_EVENT = "nhg-nav-collapse";
const NAV_TOUR_ANCHORS: Record<string, string | undefined> = {
  "/": "nav-dashboard",
  "/projects": "nav-projects",
  "/runs": "nav-runs",
  "/cve": "nav-cve",
};

function subscribe(cb: () => void) {
  window.addEventListener(NAV_COLLAPSE_EVENT, cb);
  return () => window.removeEventListener(NAV_COLLAPSE_EVENT, cb);
}
function getSnapshot(): boolean {
  return document.documentElement.dataset.navCollapsed === "1";
}
function getServerSnapshot(): boolean {
  return false; // SSR·초기 스냅샷은 펼침
}

export function AppSidebar() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !collapsed;
    if (next) document.documentElement.dataset.navCollapsed = "1";
    else delete document.documentElement.dataset.navCollapsed;
    try {
      if (next) localStorage.setItem("nhg_nav_collapsed", "1");
      else localStorage.removeItem("nhg_nav_collapsed");
    } catch {
      /* localStorage 불가 환경 무시 */
    }
    window.dispatchEvent(new Event(NAV_COLLAPSE_EVENT));
  }

  return (
    <aside
      data-app-sidebar
      className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col overflow-hidden border-r border-border bg-surface px-3 py-6 md:flex"
    >
      <div className="mb-8 flex items-center justify-between gap-2 px-1">
        {!collapsed && (
          <div className="min-w-0 px-2">
            <BrandLogo subtext />
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          title={collapsed ? "펼치기" : "접기"}
          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border text-muted hover:bg-bg hover:text-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          </svg>
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-tour={NAV_TOUR_ANCHORS[item.href]}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ${
              isActiveNav(pathname, item)
                ? "bg-primary font-semibold text-white"
                : "text-muted hover:bg-bg hover:text-text"
            } ${collapsed ? "justify-center" : ""}`}
          >
            {item.icon}
            {!collapsed && item.label}
          </Link>
        ))}
      </nav>
      <div className={`mt-2 flex items-center gap-2 border-t border-border px-1 pt-4 ${collapsed ? "justify-center" : ""}`}>
        {/* 접힘: 로그아웃 아이콘만. 펼침: 설정·도움말·다크·로그아웃. */}
        {!collapsed && (
          <>
            <Link
              href="/settings"
              data-tour="nav-settings"
              aria-label="설정"
              title="설정"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border ${
                pathname === "/settings" ? "bg-primary text-white" : "text-muted hover:bg-bg hover:text-text"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <HelpButton variant="icon" />
            <ThemeToggle />
          </>
        )}
        <LogoutButton variant="icon" />
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: AppHeader 제목 강조**

`src/app/_components/AppHeader.tsx`에서 현재 탭 제목 div의 클래스를 바꾼다:
`<div className="hidden text-[13px] text-muted md:block">` → `<div className="hidden text-[13px] font-semibold text-text md:block">`.

- [ ] **Step 6: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/NavCollapseScript.tsx src/app/_components/AppSidebar.tsx src/app/_components/AppHeader.tsx src/app/layout.tsx && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add src/app/_components/NavCollapseScript.tsx src/app/_components/AppSidebar.tsx src/app/_components/AppHeader.tsx src/app/layout.tsx src/app/globals.css
git commit -m "feat: 사이드바 접기/펼치기(아이콘만·로그아웃만) + 헤더 현재 탭 제목 강조"
```

---

## 실행 후(병합 전) 컨트롤러
- 프로덕션 재기동 시 `TZ=Asia/Seoul` 환경변수 부여(스케줄러·new Date 로컬 일관성; 표시는 formatKst 담당).
- 재빌드·재기동 후 CVE 피드/리포트 카운트업·막대, 리포트 카드 클릭 필터, 사이드바 접기, KST 시각 확인.
