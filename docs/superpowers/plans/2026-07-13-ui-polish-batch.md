# 앱 셸 & 대시보드 UI 폴리시 배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 진입 애니메이션, 브랜드 문구, 다크 아이콘, 사이드바 하단 유틸 클러스터 + /settings(AI 토글 이전), 온보딩 첫 로그인 자동+순서 재편으로 데모 완성도를 높인다.

**Architecture:** CSS-only 진입 애니메이션(서버 컴포넌트 유지), 앱 셸(사이드바/헤더) 유틸 재배치, 신규 /settings 페이지로 AI 토글 이전, 온보딩 스텝 재정의 + 버전 키.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, vitest.

## Global Constraints

- 테스트/타입/린트는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 애니메이션은 CSS 전용 + `prefers-reduced-motion: reduce` 비활성. 컴포넌트는 서버 컴포넌트 유지.
- 브랜드 보조문구 = **"AI 상시 보안 점검 체계"**.
- AI 분석 토글은 대시보드 헤더에서 제거하고 **/settings로 이전**(기존 `AiAnalysisToggle` 컴포넌트·`app_settings` 상태 재사용).
- 사이드바 하단 유틸(설정·도움말·다크·로그아웃)은 데스크톱 전용, 모바일은 헤더 유틸 유지 — 어느 뷰에서도 접근 가능.
- 온보딩 done-key = **`nhg_onboarding_done_v2`**, 자동 시작은 미열람이면 무조건(assetCount 무관).
- 컴포넌트 테스트 인프라 없음 — UI 태스크는 tsc/eslint/next build로 검증. 순수 로직(steps)만 단위 테스트.

---

### Task 1: 대시보드 진입 애니메이션 (게이지·도넛)

**Files:**
- Modify: `src/app/globals.css` (keyframes 2종 추가)
- Modify: `src/app/_components/dashboard/SecurityScoreGauge.tsx`
- Modify: `src/app/_components/dashboard/AssetStatusDonut.tsx`

**Interfaces:** 없음(순수 UI). 서버 컴포넌트 유지.

- [ ] **Step 1: globals.css에 keyframes 추가**

`src/app/globals.css` 끝(기존 `.animate-toast-in` 블록 다음)에 추가:

```css
@keyframes gauge-draw {
  from { stroke-dashoffset: 1; }
  to { stroke-dashoffset: 0; }
}
.animate-gauge-draw {
  stroke-dasharray: 1;
  animation: gauge-draw 0.9s ease-out forwards;
}
@keyframes donut-unfurl {
  from { opacity: 0; transform: rotate(-90deg) scale(0.85); }
  to { opacity: 1; transform: rotate(0deg) scale(1); }
}
.animate-donut-unfurl {
  transform-origin: center;
  animation: donut-unfurl 0.7s ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  .animate-gauge-draw { stroke-dasharray: none; animation: none; }
  .animate-donut-unfurl { animation: none; }
}
```

- [ ] **Step 2: 게이지 아크에 draw-on 적용**

`src/app/_components/dashboard/SecurityScoreGauge.tsx`에서 **컬러 아크**(조건부 `{fraction > 0 && (...)}` 안의 `<path>`)에 `pathLength={1}`과 클래스를 부여한다. 해당 path를 아래로 교체:

```tsx
        {fraction > 0 && (
          <path
            d={gaugeArcPath(100, 90, 78, START, START + SWEEP * fraction)}
            fill="none" stroke={meta.color} strokeWidth={14} strokeLinecap="round"
            pathLength={1}
            className="animate-gauge-draw"
          />
        )}
```

(배경 아크·텍스트·칩은 그대로 둔다.)

- [ ] **Step 3: 도넛 svg에 unfurl 적용**

`src/app/_components/dashboard/AssetStatusDonut.tsx`에서 세그먼트를 그리는 `<svg viewBox="0 0 160 160" ...>`에 `className`을 추가한다(기존 `className="h-[140px] w-[140px] shrink-0"` → 아래로):

```tsx
      <svg viewBox="0 0 160 160" className="h-[140px] w-[140px] shrink-0 animate-donut-unfurl" role="img" aria-label="자산 상태 분포">
```

- [ ] **Step 4: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/dashboard/SecurityScoreGauge.tsx src/app/_components/dashboard/AssetStatusDonut.tsx && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
git add src/app/globals.css src/app/_components/dashboard/SecurityScoreGauge.tsx src/app/_components/dashboard/AssetStatusDonut.tsx
git commit -m "feat: 대시보드 진입 애니메이션 — 게이지 draw-on + 도넛 펼침(CSS, reduced-motion 존중)"
```

---

### Task 2: 브랜드 보조문구 + 다크 토글 아이콘화

**Files:**
- Modify: `src/app/_components/BrandLogo.tsx`
- Modify: `src/app/_components/ThemeToggle.tsx`

**Interfaces:** `ThemeToggle`는 props 없음 유지(내부만 변경).

- [ ] **Step 1: 브랜드 보조문구 변경**

`src/app/_components/BrandLogo.tsx`의 subtext 문자열을 바꾼다:

```tsx
        {subtext && <span className="block font-mono text-[11px] text-muted">AI 상시 보안 점검 체계</span>}
```

- [ ] **Step 2: ThemeToggle 아이콘화**

`src/app/_components/ThemeToggle.tsx`의 `return`을 아래로 교체(파일 상단 import·useSyncExternalStore 로직은 그대로):

```tsx
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-bg hover:text-text"
    >
      {isDark ? (
        // 해(라이트로 전환)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // 달(다크로 전환)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
```

- [ ] **Step 3: 정적 검증 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/BrandLogo.tsx src/app/_components/ThemeToggle.tsx`
Expected: 에러 없음.

```bash
git add src/app/_components/BrandLogo.tsx src/app/_components/ThemeToggle.tsx
git commit -m "feat: 브랜드 보조문구 'AI 상시 보안 점검 체계' + 다크 토글 아이콘화"
```

---

### Task 3: /settings 페이지 + 대시보드에서 AI 토글 제거

**Files:**
- Create: `src/app/settings/page.tsx`
- Modify: `src/app/page.tsx` (AI 토글·import 제거)

**Interfaces:**
- Consumes: `AiAnalysisToggle`(@/app/_components/AiAnalysisToggle), `getAiAnalysisEnabled`(@/lib/settings/store), `Card`.
- Produces: `/settings` 라우트.

- [ ] **Step 1: /settings 페이지 생성**

`src/app/settings/page.tsx`:

```tsx
import { getAiAnalysisEnabled } from "@/lib/settings/store";
import { AiAnalysisToggle } from "../_components/AiAnalysisToggle";
import { Card } from "../_components/Card";

// 설정 페이지: 런타임 앱 설정. 현재는 AI 분석 토글(대시보드에서 이전).
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">설정</h1>
        <p className="mt-1 text-[13px] text-muted">런타임 동작을 제어합니다.</p>
      </div>
      <Card title="AI 분석 (Claude)">
        <p className="mb-4 text-[13px] text-muted">
          점검·CVE 분석 시 Claude로 판정 근거·조치·영향분석을 생성합니다. 기본은 꺼짐(토큰 절약).
        </p>
        <AiAnalysisToggle initialEnabled={getAiAnalysisEnabled()} />
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: 대시보드 헤더에서 AI 토글 제거**

`src/app/page.tsx`:
- import 2줄 제거: `import { AiAnalysisToggle } from "./_components/AiAnalysisToggle";` 와 `import { getAiAnalysisEnabled } from "@/lib/settings/store";`
- 헤더의 토글 래퍼를 제거해 "자산 등록"만 남긴다. 아래 블록을:

```tsx
        <div className="flex flex-wrap items-center gap-3">
          <AiAnalysisToggle initialEnabled={getAiAnalysisEnabled()} />
          <Link
            href="/assets/new"
            data-tour="asset-register"
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            자산 등록
          </Link>
        </div>
```

아래로 교체:

```tsx
        <Link
          href="/assets/new"
          data-tour="asset-register"
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          자산 등록
        </Link>
```

- [ ] **Step 3: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/settings/page.tsx src/app/page.tsx && npx next build 2>&1 | tail -3`
Expected: 에러 없음, `/settings` 라우트 빌드, 대시보드에 AiAnalysisToggle 미참조.

```bash
git add src/app/settings/page.tsx src/app/page.tsx
git commit -m "feat: /settings 페이지 신설 + AI 분석 토글을 대시보드에서 설정으로 이전"
```

---

### Task 4: 사이드바 하단 유틸 클러스터 + 헤더 모바일/데스크톱 분기 + 로그아웃 공용화

**Files:**
- Create: `src/app/_components/LogoutButton.tsx`
- Modify: `src/app/_components/AppSidebar.tsx`
- Modify: `src/app/_components/AppHeader.tsx`
- Modify: `src/app/_components/navItems.tsx` (CVE 항목 data-tour 매핑용은 사이드바에서 처리)

**Interfaces:**
- Consumes: `ThemeToggle`, `HelpButton`(기존), `LogoutButton`(신규 추출).
- Produces: `LogoutButton` 컴포넌트. 사이드바 하단 클러스터에 `data-tour="nav-cve"`(CVE nav 링크)·`data-tour="nav-settings"`(설정 아이콘) 부여.

- [ ] **Step 1: 로그아웃 버튼 공용 컴포넌트 추출**

`src/app/_components/LogoutButton.tsx`:

```tsx
"use client";

import { useState } from "react";

// 헤더(모바일)·사이드바(데스크톱)가 공유하는 로그아웃 버튼. variant로 텍스트/아이콘 형태 선택.
export function LogoutButton({ variant = "text" }: { variant?: "text" | "icon" }) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // 전체 리로드로 루트 레이아웃의 서버 세션 체크가 재실행되어 쿠키 삭제가 즉시 반영됨.
      window.location.href = "/login";
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label="로그아웃"
        title="로그아웃"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-bg hover:text-text disabled:opacity-60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:bg-bg disabled:opacity-60"
    >
      {loggingOut ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
```

- [ ] **Step 2: HelpButton에 아이콘 variant 추가**

`src/app/_components/onboarding/HelpButton.tsx`의 `HelpButton`에 `variant` prop을 추가한다(기존 텍스트 버튼은 기본). `start()` 함수는 그대로 두고 `return`을 아래로 교체:

```tsx
export function HelpButton({ variant = "text" }: { variant?: "text" | "icon" }) {
  function start() {
    sessionStorage.setItem(ONBOARDING_FORCE_KEY, "1");
    window.location.assign("/");
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={start}
        aria-label="온보딩 도움말 다시 보기"
        title="도움말"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-bg hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.5-3 4" />
          <path d="M12 17h.01" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:bg-bg"
      aria-label="온보딩 도움말 다시 보기"
    >
      도움말
    </button>
  );
}
```

- [ ] **Step 3: 사이드바 하단 클러스터 추가**

`src/app/_components/AppSidebar.tsx`를 아래로 교체:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActiveNav } from "./navItems";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { HelpButton } from "./onboarding/HelpButton";
import { LogoutButton } from "./LogoutButton";

// 온보딩 투어 앵커: 내비 href → data-tour 값. 투어 스텝(steps.ts)의 anchor와 일치해야 한다.
const NAV_TOUR_ANCHORS: Record<string, string | undefined> = {
  "/": "nav-dashboard",
  "/projects": "nav-projects",
  "/runs": "nav-runs",
  "/cve": "nav-cve",
};

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-surface px-3 py-6 md:flex">
      <div className="mb-8 px-3">
        <BrandLogo subtext />
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-tour={NAV_TOUR_ANCHORS[item.href]}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ${
              isActiveNav(pathname, item)
                ? "bg-primary font-semibold text-white"
                : "text-muted hover:bg-bg hover:text-text"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      {/* 하단 유틸 클러스터: 설정·도움말·다크모드·로그아웃 (데스크톱 전용 — 사이드바 자체가 md:flex). */}
      <div className="mt-2 flex items-center gap-2 border-t border-border px-1 pt-4">
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
        <LogoutButton variant="icon" />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: 헤더를 모바일 유틸 전용으로 정리**

`src/app/_components/AppHeader.tsx`를 아래로 교체(로그아웃 로직은 LogoutButton으로 이전, 데스크톱은 유틸 제거·모바일만 유지):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpButton } from "./onboarding/HelpButton";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "./LogoutButton";
import { BrandLogo } from "./BrandLogo";
import { NAV_ITEMS, isActiveNav } from "./navItems";

interface HeaderUser {
  username: string;
}

export function AppHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActiveNav(pathname, item));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <div className="min-w-0 md:hidden">
          <BrandLogo />
        </div>
        <div className="hidden text-[13px] text-muted md:block">
          {current ? current.label : "NH-Guardian"}
        </div>
        <div className="flex-1" />
        {user && (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-white">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-[13px] font-medium md:inline">{user.username}</span>
            {/* 데스크톱은 사이드바 하단 클러스터가 유틸을 담당 → 헤더 유틸은 모바일 전용. */}
            <div className="flex items-center gap-2 md:hidden">
              <HelpButton variant="icon" />
              <ThemeToggle />
              <LogoutButton variant="icon" />
            </div>
          </>
        )}
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] whitespace-nowrap ${
              isActiveNav(pathname, item)
                ? "bg-primary font-semibold text-white"
                : "text-muted hover:bg-bg"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 5: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/LogoutButton.tsx src/app/_components/AppSidebar.tsx src/app/_components/AppHeader.tsx src/app/_components/onboarding/HelpButton.tsx && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add src/app/_components/LogoutButton.tsx src/app/_components/AppSidebar.tsx src/app/_components/AppHeader.tsx src/app/_components/onboarding/HelpButton.tsx
git commit -m "feat: 사이드바 하단 유틸 클러스터(설정·도움말·다크·로그아웃) + 헤더 모바일 전용화, 로그아웃 공용 컴포넌트 추출"
```

---

### Task 5: 온보딩 첫 로그인 자동 + 순서 재편 + 신규 반영

**Files:**
- Modify: `src/lib/onboarding/steps.ts`
- Modify: `src/lib/onboarding/steps.test.ts`
- Modify: `src/app/_components/onboarding/OnboardingTour.tsx` (shouldAutoStart 호출부)

**Interfaces:**
- Produces: `shouldAutoStart(seen: boolean): boolean`(시그니처 단순화), `ONBOARDING_DONE_KEY = "nhg_onboarding_done_v2"`, 9-스텝 `ONBOARDING_STEPS`.

- [ ] **Step 1: steps.test.ts를 새 사양으로 갱신(실패 상태)**

`src/lib/onboarding/steps.test.ts`를 아래로 교체:

```typescript
import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  shouldAutoStart,
  ONBOARDING_DONE_KEY,
  ONBOARDING_FORCE_KEY,
} from "./steps";

describe("shouldAutoStart", () => {
  it("미열람이면 자동 시작한다(자산 수 무관)", () => {
    expect(shouldAutoStart(false)).toBe(true);
  });
  it("이미 열람했으면 자동 시작하지 않는다", () => {
    expect(shouldAutoStart(true)).toBe(false);
  });
});

describe("ONBOARDING_STEPS", () => {
  it("실 사용 흐름 순서의 9개 스텝", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      "welcome", "register", "scan", "progress", "results", "ai-analysis", "cve-feed", "share", "done",
    ]);
  });
  it("key가 유일하다", () => {
    const keys = ONBOARDING_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("center 스텝은 anchor null, auto 스텝은 anchor 문자열", () => {
    for (const s of ONBOARDING_STEPS) {
      if (s.placement === "center") expect(s.anchor).toBeNull();
      else expect(typeof s.anchor).toBe("string");
    }
  });
  it("번호 스텝은 stepNumber 1~7을 순서대로 가진다", () => {
    const numbered = ONBOARDING_STEPS.filter((s) => s.stepNumber !== undefined).map((s) => s.stepNumber);
    expect(numbered).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("마지막 스텝(done)은 자산 등록 CTA를 가진다", () => {
    const last = ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1];
    expect(last.key).toBe("done");
    expect(last.cta).toEqual({ label: "자산 등록하기", href: "/assets/new" });
  });
  it("auto 스텝의 anchor는 부여할 data-tour 키와 일치한다", () => {
    const anchors = ONBOARDING_STEPS.filter((s) => s.anchor).map((s) => s.anchor);
    expect(anchors).toEqual([
      "asset-register", "nav-projects", "nav-runs", "nav-dashboard", "nav-settings", "nav-cve", "nav-projects",
    ]);
  });
  it("done-key는 v2로 올려 기존 열람자도 업데이트 투어를 1회 본다", () => {
    expect(ONBOARDING_DONE_KEY).toBe("nhg_onboarding_done_v2");
    expect(ONBOARDING_FORCE_KEY).toBe("nhg_onboarding_force");
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/onboarding/steps.test.ts`
Expected: FAIL — 순서·shouldAutoStart 시그니처·done-key 불일치.

- [ ] **Step 3: steps.ts 갱신**

`src/lib/onboarding/steps.ts`를 아래로 교체:

```typescript
export interface OnboardingStep {
  key: string;
  anchor: string | null; // data-tour 값. center 스텝이면 null
  stepNumber?: number; // 순번 배지에 표시할 숫자(환영·완료 스텝은 없음)
  title: string;
  body: string;
  placement: "center" | "auto";
  cta?: { label: string; href: string };
  preview?: "scan" | "progress" | "results" | "share";
}

// 업데이트된 투어(신규 스텝 포함)이므로 done-key를 v2로 올린다 — 기존 열람자도 1회 자동 노출.
export const ONBOARDING_DONE_KEY = "nhg_onboarding_done_v2";
export const ONBOARDING_FORCE_KEY = "nhg_onboarding_force";

// 아직 투어를 보지 않았으면 첫 로그인 시 자동 시작한다(자산 수 무관).
export function shouldAutoStart(seen: boolean): boolean {
  return !seen;
}

// 실 사용 흐름: 등록 → 점검 → 진행 → 분석 보고서 → AI 분석 → 실시간 CVE 대응 → 공유.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "welcome",
    anchor: null,
    placement: "center",
    title: "환영합니다",
    body: "NH-Guardian에 오신 걸 환영합니다. 자산 점검부터 분석 보고서·실시간 CVE 대응까지 차근차근 안내할게요.",
  },
  {
    key: "register",
    anchor: "asset-register",
    stepNumber: 1,
    placement: "auto",
    title: "자산 등록",
    body: "점검할 서버·레포를 등록하세요. 엑셀 업로드로 여러 개를 한 번에 올릴 수 있어요.",
  },
  {
    key: "scan",
    anchor: "nav-projects",
    stepNumber: 2,
    placement: "auto",
    title: "점검 실행",
    body: "자산을 프로젝트로 묶고, 선택 일괄 점검하거나 프로젝트에서 전체(Fleet) 점검을 실행하세요.",
    preview: "scan",
  },
  {
    key: "progress",
    anchor: "nav-runs",
    stepNumber: 3,
    placement: "auto",
    title: "점검 진행",
    body: "점검이 시작되면 단계·진행률이 실시간으로 표시됩니다.",
    preview: "progress",
  },
  {
    key: "results",
    anchor: "nav-dashboard",
    stepNumber: 4,
    placement: "auto",
    title: "분석 보고서",
    body: "완료되면 대시보드 점수·활동 피드에 반영되고, 각 리포트에서 취약 항목·CVE·AI 분석 근거·조치를 봅니다.",
    preview: "results",
  },
  {
    key: "ai-analysis",
    anchor: "nav-settings",
    stepNumber: 5,
    placement: "auto",
    title: "AI 분석 켜기",
    body: "설정에서 AI 분석(Claude)을 켜면 점검·CVE에 대한 판정 근거·조치·영향분석을 자동 생성합니다. 기본은 꺼짐(토큰 절약).",
  },
  {
    key: "cve-feed",
    anchor: "nav-cve",
    stepNumber: 6,
    placement: "auto",
    title: "실시간 CVE 대응",
    body: "CVE 피드는 NVD에서 수집한 취약점을 보유 자산과 대조해 '지금 조치할 것'만 골라냅니다. 새 매칭은 우하단 알림으로 즉시 뜹니다.",
  },
  {
    key: "share",
    anchor: "nav-projects",
    stepNumber: 7,
    placement: "auto",
    title: "PM에게 공유",
    body: "프로젝트 상세의 '공유 설정'에서 담당 PM에게 점검 리포트를 공유 링크로 전달할 수 있어요.",
    preview: "share",
  },
  {
    key: "done",
    anchor: null,
    placement: "center",
    title: "준비됐습니다",
    body: "첫 자산을 등록해 시작해 보세요.",
    cta: { label: "자산 등록하기", href: "/assets/new" },
  },
];
```

- [ ] **Step 4: OnboardingTour 호출부 갱신**

`src/app/_components/onboarding/OnboardingTour.tsx`의 자동 시작 분기에서 `shouldAutoStart(assetCount, seen)` → `shouldAutoStart(seen)`으로 바꾼다:

```tsx
    } else if (shouldAutoStart(seen)) {
      setActive(true);
    }
```

(`assetCount` prop·의존성 배열은 그대로 둔다 — 대시보드가 전달하는 값이라 시그니처 영향 없음.)

- [ ] **Step 5: 테스트/타입/린트/빌드 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/onboarding/steps.test.ts && npx tsc --noEmit && npx eslint src/lib/onboarding/steps.ts src/lib/onboarding/steps.test.ts "src/app/_components/onboarding/OnboardingTour.tsx" && npx next build 2>&1 | tail -3`
Expected: 전체 PASS, 에러 없음, 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/onboarding/steps.ts src/lib/onboarding/steps.test.ts "src/app/_components/onboarding/OnboardingTour.tsx"
git commit -m "feat: 온보딩 첫 로그인 자동(v2) + 실 사용 흐름 순서 재편 + AI분석·CVE피드 신규 스텝"
```
