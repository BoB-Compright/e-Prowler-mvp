# Stitch Kinetic 전체 리스킨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stitch "Kinetic Security System" 디자인을 e-Prowler 앱 전체에 이식한다 — 토큰 교체, 사이드바 셸 전환, 전 화면 리스킨.

**Architecture:** `globals.css`의 CSS 변수 값만 교체(변수명 유지)해 앱 전체 톤을 먼저 바꾸고, 상단 헤더 셸을 고정 좌측 사이드바 + 유틸 헤더로 전환한 뒤, 화면을 노출 빈도순으로 개편한다. 기능·데이터 바인딩·API는 일절 건드리지 않는 순수 UI 리스킨이다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4 (`@theme inline` 토큰), next/font (Inter + JetBrains Mono), vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-stitch-kinetic-reskin-design.md`

## Global Constraints

- CSS 변수 **이름은 절대 변경 금지** (`--color-primary`, `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-pass`, `--color-fail`, `--color-review`, `--color-neutral`, `--radius-nh`). 값만 교체.
- 기능 변경 금지: 서버 컴포넌트의 데이터 조회, API 호출, 폼 액션, 폴링 로직, 라우트 구조는 그대로. className과 마크업 구조(래퍼 div, 순서)만 변경 가능.
- 목업에만 있는 가짜 요소(장식용 트렌드 화살표, 알림/설정 아이콘, 더미 지표) **구현 금지**. 실데이터가 있는 요소만.
- 현재 화면에 있는 기능 요소(버튼·폼·상태 표시)는 목업에 없어도 **전부 유지**하고 Kinetic 스타일만 입힌다.
- 외부 CDN·아이콘 폰트 도입 금지. 아이콘은 인라인 SVG (기존 아이콘 스타일: `width 15, stroke currentColor, strokeWidth 2`).
- 참고 목업: `design_handoff_stitch/*.html` (정적 목업 — 마크업 복붙 금지, 레이아웃·스타일 참고만).
- 검증 커맨드: `npm test` (vitest 전체 통과 유지), `npx eslint <파일>`, 최종 태스크에서 `npm run build`.
- 커밋 메시지는 한국어 conventional commit (`feat:`/`refactor:`/`docs:`), 말미에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## 공통 스타일 레시피 (모든 화면 태스크에서 사용)

각 화면 태스크는 아래 레시피를 그대로 적용한다. 레시피에 없는 판단이 필요하면 해당 화면의 목업 HTML을 근거로 삼는다.

| 요소 | 클래스 레시피 |
|---|---|
| 페이지 컨테이너 | `mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8` |
| 페이지 타이틀 | `text-[26px] font-bold tracking-[-0.02em]` + 아래 부제 `text-[13px] text-muted` |
| 카드 | `Card` 컴포넌트 (Task 2) — `rounded-lg border border-border bg-surface` |
| 대형 위젯 카드 | `Card`에 `className="rounded-2xl"` 오버라이드 |
| 섹션/테이블 헤더 라벨 | `SectionLabel` 컴포넌트 (Task 2) — 12px/700/uppercase/tracking 0.05em/muted |
| 상태·심각도 배지 | `StatusBadge` 컴포넌트 (Task 2) — pill, `bg-{status}/10 text-{status}` |
| 기본(Primary) 버튼 | `rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90` |
| 보조(Secondary) 버튼 | `rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5` |
| 위험(Danger) 버튼 | `rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90` |
| 입력 필드 | `rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary` + 라벨은 항상 입력 위 `text-[13px] font-medium` (플레이스홀더 온리 금지) |
| 데이터 테이블 | 헤더 행 `SectionLabel` 스타일, 줄무늬 없음, `divide-y divide-border`, 행 호버 `hover:bg-bg` |
| 기술 데이터(ID·IP·경로·커맨드) | `font-mono text-[13px]` |
| 그림자 | 카드에 그림자 금지(보더로 경계). 모달/드로어만 `shadow-[0_12px_32px_rgba(0,0,0,0.1)]` |

주의: `bg-primary`, `text-muted`, `border-border`, `bg-surface`, `bg-bg`, `text-pass`, `bg-fail/10` 등은
`globals.css`의 `@theme inline` 등록 덕에 Tailwind 4 유틸리티로 바로 동작한다 (`var(--color-*)` 아비트러리 표기 불필요).
기존 코드의 `[var(--color-*)]` 아비트러리 표기를 만나면 수정하는 김에 테마 유틸리티로 정리한다.

---

### Task 1: 디자인 토큰 교체 + JetBrains Mono

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx:1-8` (폰트 로드만)

**Interfaces:**
- Produces: Tailwind 유틸리티 `bg-bg/bg-surface/border-border/text-text/text-muted/bg-primary/…` 의 새 색상 값, `--radius-nh: 8px`, `--font-mono`(JetBrains Mono). 이후 모든 태스크가 이 토큰을 소비.

- [ ] **Step 1: globals.css의 `:root`·`[data-theme="dark"]`·`@theme` 블록 교체**

`src/app/globals.css`의 1~55행(`@import`부터 `@theme inline` 블록 끝까지)을 아래로 교체한다.
`body` 블록과 `@keyframes`(scan-pulse-ring, terminal-cursor-blink)는 그대로 둔다.

```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root {
  /* Kinetic Security System tokens (Stitch projects/936621672799851412,
     spec: docs/superpowers/specs/2026-07-09-stitch-kinetic-reskin-design.md) */
  --color-primary: #0052ff; /* primary-container (Trust Blue) */
  --color-secondary: #4c5e85; /* secondary */
  --color-pass: #00c076; /* tertiary override (Success Green) */
  --color-fail: #ba1a1a; /* error */
  --color-review: #f4b000; /* Warning Amber — Kinetic에 amber 토큰이 없어 유지 */
  --color-neutral: #9ba6b5; /* tertiary/disabled text */

  --color-bg: #f8f9ff; /* surface (쿨톤 캔버스) */
  --color-surface: #ffffff; /* surface-container-lowest (카드) */
  --color-border: #c3c5d9; /* outline-variant */
  --color-text: #0e1d2b; /* on-surface */
  --color-muted: #697789; /* secondary text */
}

[data-theme="dark"] {
  /* Stitch 목업의 dark:(inverse-surface 계열) 클래스에서 파생 */
  --color-bg: #0e1d2b; /* on-surface 반전 */
  --color-surface: #243141; /* inverse-surface */
  --color-border: rgba(233, 241, 255, 0.14); /* inverse-on-surface 14% */
  --color-text: #e9f1ff; /* inverse-on-surface */
  --color-muted: #8fa3c0; /* inverse-on-surface 감쇠 */
}

@theme inline {
  --color-primary: var(--color-primary);
  --color-secondary: var(--color-secondary);
  --color-pass: var(--color-pass);
  --color-fail: var(--color-fail);
  --color-review: var(--color-review);
  --color-neutral: var(--color-neutral);
  --color-bg: var(--color-bg);
  --color-surface: var(--color-surface);
  --color-border: var(--color-border);
  --color-text: var(--color-text);
  --color-muted: var(--color-muted);

  /* Inter에는 한글 글리프가 없어 Malgun Gothic/system-ui로 폴백 — 한글 렌더링 무영향 */
  --font-sans: var(--font-inter), "Malgun Gothic", "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-jbmono), Consolas, "Courier New", monospace;

  /* Kinetic Standard radius. 배지는 pill(rounded-full), 대형 위젯은 rounded-2xl을 직접 지정 */
  --radius-nh: 8px;
}
```

- [ ] **Step 2: layout.tsx에 JetBrains Mono 로드**

`src/app/layout.tsx`의 2행과 8행을 다음으로 교체:

```tsx
import { Inter, JetBrains_Mono } from "next/font/google";
```

```tsx
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });
```

그리고 21행 `<html>`의 className에 변수 추가:

```tsx
<html lang="ko" data-theme="light" className={`h-full antialiased ${inter.variable} ${jbMono.variable}`}>
```

- [ ] **Step 3: 검증**

Run: `npm test` → 전체 PASS (로직 무변경).
Run: `npx eslint src/app/layout.tsx` → 에러 없음.
dev 서버(`npm run dev`)에서 `/` 접속: 배경이 쿨톤(#f8f9ff), 카드가 흰색, 버튼 라운드가 각져 보이면 정상. 다크 토글 시 남색 계열(#0e1d2b) 배경 확인.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: 디자인 토큰을 Kinetic Security System으로 교체"
```

---

### Task 2: 공용 컴포넌트 (StatusBadge · Card · SectionLabel)

**Files:**
- Create: `src/app/_components/statusBadge.ts`
- Create: `src/app/_components/statusBadge.test.ts`
- Create: `src/app/_components/StatusBadge.tsx`
- Create: `src/app/_components/Card.tsx`
- Create: `src/app/_components/SectionLabel.tsx`

**Interfaces:**
- Consumes: Task 1의 테마 유틸리티(`bg-pass/10` 등).
- Produces:
  - `statusBadgeClass(status: BadgeStatus): string`, `type BadgeStatus = "pass" | "fail" | "review" | "neutral"`
  - `<StatusBadge status={BadgeStatus}>{children}</StatusBadge>`
  - `<Card title?={ReactNode} action?={ReactNode} className?={string} bodyClassName?={string}>{children}</Card>`
  - `<SectionLabel className?={string}>{children}</SectionLabel>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/_components/statusBadge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { statusBadgeClass } from "./statusBadge";

describe("statusBadgeClass", () => {
  it("상태별로 같은 색 계열의 저채도 배경 + 텍스트 클래스를 반환한다", () => {
    expect(statusBadgeClass("pass")).toBe("bg-pass/10 text-pass");
    expect(statusBadgeClass("fail")).toBe("bg-fail/10 text-fail");
    expect(statusBadgeClass("review")).toBe("bg-review/15 text-review");
    expect(statusBadgeClass("neutral")).toBe("bg-neutral/15 text-muted");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/app/_components/statusBadge.test.ts`
Expected: FAIL — `Cannot find module './statusBadge'`

- [ ] **Step 3: 구현**

`src/app/_components/statusBadge.ts`:

```ts
export type BadgeStatus = "pass" | "fail" | "review" | "neutral";

// Kinetic 배지 규칙: 동일 색상의 저채도(10~15%) 배경 + 고대비 텍스트, pill 형태.
const CLASSES: Record<BadgeStatus, string> = {
  pass: "bg-pass/10 text-pass",
  fail: "bg-fail/10 text-fail",
  review: "bg-review/15 text-review",
  neutral: "bg-neutral/15 text-muted",
};

export function statusBadgeClass(status: BadgeStatus): string {
  return CLASSES[status];
}
```

`src/app/_components/StatusBadge.tsx`:

```tsx
import { statusBadgeClass, type BadgeStatus } from "./statusBadge";

export function StatusBadge({
  status,
  children,
}: {
  status: BadgeStatus;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(status)}`}
    >
      {children}
    </span>
  );
}
```

`src/app/_components/Card.tsx`:

```tsx
export function Card({
  title,
  action,
  className = "",
  bodyClassName = "p-5",
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-border bg-surface ${className}`}>
      {title != null && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
```

`src/app/_components/SectionLabel.tsx`:

```tsx
export function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-[11px] font-bold uppercase tracking-[0.05em] text-muted ${className}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/app/_components/statusBadge.test.ts` → PASS
Run: `npm test` → 전체 PASS
Run: `npx eslint src/app/_components/` → 에러 없음

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/statusBadge.ts src/app/_components/statusBadge.test.ts src/app/_components/StatusBadge.tsx src/app/_components/Card.tsx src/app/_components/SectionLabel.tsx
git commit -m "feat: Kinetic 공용 컴포넌트 추가 (StatusBadge·Card·SectionLabel)"
```

---

### Task 3: 앱 셸 전환 (사이드바 + 유틸 헤더)

**Files:**
- Create: `src/app/_components/navItems.tsx`
- Create: `src/app/_components/AppSidebar.tsx`
- Modify: `src/app/_components/AppHeader.tsx` (전면 교체)
- Modify: `src/app/_components/ThemeToggle.tsx:34-41` (스타일만)
- Modify: `src/app/layout.tsx:20-30`

**Interfaces:**
- Consumes: 기존 `ThemeToggle`(동작 무변경), Task 1 토큰.
- Produces: `NAV_ITEMS: { href: string; label: string; icon: ReactNode }[]`, `isActiveNav(pathname, item): boolean`, `<AppSidebar />`, `<AppHeader />`. 페이지 콘텐츠는 `md:pl-64` 컬럼 안에 렌더된다.

참고 목업: 모든 목업 공통 셸 — `w-64` 고정 사이드바(로고 + 내비 5항목) + `h-16` 유틸 헤더.

- [ ] **Step 1: navItems.tsx 생성 — 기존 AppHeader의 아이콘·TABS·isActive 이동**

`src/app/_components/navItems.tsx`: 현재 `AppHeader.tsx`의 7~65행(아이콘 5개 함수, `TABS` 배열, `isActive` 함수)을 그대로 옮기되 이름을 export로 바꾼다:

```tsx
// 아이콘 5개 함수(DashboardIcon~ProjectIcon)는 AppHeader.tsx 7-52행에서 그대로 이동

export const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: <DashboardIcon /> },
  { href: "/assets", label: "자산 관리", icon: <AssetIcon /> },
  { href: "/projects", label: "프로젝트", icon: <ProjectIcon /> },
  { href: "/runs", label: "점검 이력", icon: <HistoryIcon /> },
  { href: "/catalog", label: "카탈로그", icon: <CatalogIcon /> },
];

export function isActiveNav(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
```

(라벨 "자산"→"자산 관리"는 목업 표기를 따름. 라우트는 동일.)

- [ ] **Step 2: AppSidebar.tsx 생성**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActiveNav } from "./navItems";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-surface px-3 py-6 md:flex">
      <div className="mb-8 px-3">
        <div className="text-[17px] font-bold tracking-tight text-primary">NH-Guardian</div>
        <div className="font-mono text-[11px] text-muted">e-Prowler · 자산 보안 점검</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
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
    </aside>
  );
}
```

- [ ] **Step 3: AppHeader.tsx 전면 교체 — 유틸 헤더 + 모바일 내비**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_ITEMS, isActiveNav } from "./navItems";

export function AppHeader() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActiveNav(pathname, item));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <div className="min-w-0 md:hidden">
          <div className="truncate text-[15px] font-bold tracking-tight text-primary">NH-Guardian</div>
        </div>
        <div className="hidden text-[13px] text-muted md:block">
          {current ? current.label : "e-Prowler"}
        </div>
        <div className="flex-1" />
        <ThemeToggle />
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

- [ ] **Step 4: ThemeToggle 스타일 교체 (동작 무변경)**

`ThemeToggle.tsx`의 `<button>` className만 교체 — 흰 헤더 위 중립 버튼:

```tsx
className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-bg hover:text-text"
```

- [ ] **Step 5: layout.tsx 셸 구조 교체**

`RootLayout`의 return을 다음으로 교체 (import에 `AppSidebar` 추가):

```tsx
import { AppSidebar } from "./_components/AppSidebar";
```

```tsx
return (
  <html lang="ko" data-theme="light" className={`h-full antialiased ${inter.variable} ${jbMono.variable}`}>
    <head>
      <ThemeScript />
    </head>
    <body className="min-h-full">
      <AppSidebar />
      <div className="flex min-h-screen flex-col md:pl-64">
        <AppHeader />
        {children}
      </div>
    </body>
  </html>
);
```

- [ ] **Step 6: 검증**

Run: `npm test` → PASS. `npx eslint src/app/_components/ src/app/layout.tsx` → 에러 없음.
dev 서버: 데스크톱 폭에서 좌측 사이드바 + 흰 유틸 헤더, 활성 내비가 파란 배경. 창을 좁히면 사이드바가 사라지고 헤더 아래 가로 스크롤 내비 노출. 5개 라우트 모두 이동 확인. 라이트/다크 확인.

- [ ] **Step 7: Commit**

```bash
git add src/app/_components/ src/app/layout.tsx
git commit -m "feat: 앱 셸을 사이드바 + 유틸 헤더 구조로 전환"
```

---

### Task 4: 대시보드 리스킨 (`/`)

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/LocalImageFallbackForm.tsx` (폼 스타일만)
- Modify: `src/app/_components/RiskSummaryBar.tsx` (색·라운드 미세조정만)

**Interfaces:**
- Consumes: `Card`, `SectionLabel`, `StatusBadge`, 공통 레시피.

참고 목업: `design_handoff_stitch/dashboard_16c0.html` — 구성: 페이지 타이틀("보안 현황 개요") → KPI 스탯 타일 행 → "자산 보안 상태" / "고위험 CVE TOP 5" 2컬럼 → "최근 활동 피드" → "로컬 이미지 스캔 폴백".
현재 `page.tsx`의 데이터 소스(지표 계산, CVE 목록, 활동 피드 조회)와 섹션 구성은 목업과 동일하므로 **스타일·레이아웃만 교체**한다.

- [ ] **Step 1: 페이지 컨테이너·타이틀 교체**

`<main className="mx-auto w-full max-w-5xl px-6 py-10">` → 공통 레시피 컨테이너.
페이지 상단에 타이틀 블록:

```tsx
<div className="mb-6">
  <h1 className="text-[26px] font-bold tracking-[-0.02em]">보안 현황 개요</h1>
  <p className="text-[13px] text-muted">전체 자산의 보안 점검 현황 요약</p>
</div>
```

- [ ] **Step 2: KPI 스탯 타일을 Kinetic 스타일로**

기존 지표 카드 마크업을 아래 패턴으로 (데이터 변수는 기존 것 그대로):

```tsx
<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
  <div className="rounded-2xl border border-border bg-surface p-5">
    <SectionLabel>전체 자산</SectionLabel>
    <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">{totalAssets}</div>
  </div>
  {/* 나머지 타일 동일 패턴: 고위험 자산(text-fail), 진행 중 점검, 완료 점검 */}
</div>
```

수치가 위험 지표면 숫자에 `text-fail`, 정상 지표면 기본 텍스트색.

- [ ] **Step 3: 나머지 섹션을 Card로 감싸기**

"자산 보안 상태"·"고위험 CVE TOP 5"는 `lg:grid-cols-2` 그리드에 `<Card title="자산 보안 상태">…</Card>` 형태로.
"최근 활동 피드"·"로컬 이미지 스캔 폴백"도 각각 Card. 내부 목록은 데이터 테이블 레시피(divide-y, 호버 필). 상태 표기는 기존 색 span 대신 `StatusBadge`. CVE ID·자산 ID는 `font-mono text-[13px]`.
`LocalImageFallbackForm`의 입력·버튼은 입력 필드/Primary 버튼 레시피. `RiskSummaryBar`는 라운드를 `rounded-full`(게이지 바 형태 유지)로, 색은 이미 토큰 참조라 무변경.

- [ ] **Step 4: 검증**

Run: `npm test` → PASS. `npx eslint src/app/page.tsx src/app/LocalImageFallbackForm.tsx src/app/_components/RiskSummaryBar.tsx` → 에러 없음.
dev 서버 `/`에서 목업(`dashboard_16c0.html` 스크린샷)과 대조 — 라이트/다크 모두.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/LocalImageFallbackForm.tsx src/app/_components/RiskSummaryBar.tsx
git commit -m "feat: 대시보드를 Kinetic 디자인으로 리스킨"
```

---

### Task 5: 자산 화면 리스킨 (`/assets`, `/assets/[id]`, `/assets/new`, `/assets/upload`)

**Files:**
- Modify: `src/app/assets/page.tsx`, `src/app/assets/AssetFilters.tsx`
- Modify: `src/app/assets/[id]/page.tsx`, `src/app/assets/[id]/CveList.tsx`, `src/app/assets/[id]/ScheduleForm.tsx`, `src/app/assets/[id]/StartScanButton.tsx`
- Modify: `src/app/assets/new/page.tsx`, `src/app/assets/new/AssetForm.tsx`
- Modify: `src/app/assets/upload/page.tsx`, `src/app/assets/upload/UploadForm.tsx`

**Interfaces:**
- Consumes: `Card`, `SectionLabel`, `StatusBadge`, 공통 레시피.

참고 목업: `assets_list.html`(목록 테이블 + 필터), `asset_detail_ko.html`(자산 헤더 + 정보 그리드 + CVE 목록), `asset_new.html`(등록 폼 — 섹션 분할: 기본 정보 / SSH Credentials). `/assets/upload`는 전용 목업이 없으므로 `asset_new.html`의 폼 스타일을 준용한다.

- [ ] **Step 1: 자산 목록 — 컨테이너·테이블·필터**

컨테이너/타이틀 레시피 적용(타이틀 "자산 관리"). 자산 테이블을 Card(`bodyClassName="p-0"`)로 감싸고 데이터 테이블 레시피: 헤더 셀 `SectionLabel`, 행 `divide-y divide-border hover:bg-bg`, 자산 ID·IP·레포 URL `font-mono text-[13px]`, 상태·위험도는 `StatusBadge`. `AssetFilters`의 셀렉트·입력은 입력 필드 레시피, 등록/업로드 링크 버튼은 Primary/Secondary 버튼 레시피.

- [ ] **Step 2: 자산 상세 — 헤더 + 정보 카드 + CVE 목록**

상단: 자산명 타이틀 + 옆에 상태 `StatusBadge`, 아래 `font-mono` 식별자. 우측에 `StartScanButton`(Primary 버튼 레시피, 기존 `scan-pulse-ring` 애니메이션 클래스 유지).
자산 정보(호스트·OS·담당자 등)는 `Card` 안 2열 정의 리스트(`SectionLabel` 라벨 + 값). `ScheduleForm`·`CveList`도 각각 Card로. CVE 항목은 `font-mono` CVE ID + severity `StatusBadge`(critical/high→`fail`, medium→`review`, low→`neutral` 매핑 — 기존 매핑 로직이 있으면 그대로 쓰고 표시만 교체).

- [ ] **Step 3: 등록·업로드 폼**

`AssetForm`/`UploadForm`/`ScheduleForm`: 모든 입력에 입력 필드 레시피 + 상단 라벨. 폼 섹션을 Card로 분할(목업처럼 "기본 정보", "SSH 자격 증명" 등 — 현재 폼의 필드 그룹 기준). 제출 버튼 Primary, 취소·템플릿 다운로드는 Secondary.

- [ ] **Step 4: 검증**

Run: `npm test` → PASS. `npx eslint src/app/assets/` → 에러 없음.
dev 서버에서 4개 라우트 + 필터·폼 동작(제출 아님, 렌더만) 확인, 라이트/다크, 목업 대조.

- [ ] **Step 5: Commit**

```bash
git add src/app/assets/
git commit -m "feat: 자산 목록·상세·등록·업로드 화면을 Kinetic 디자인으로 리스킨"
```

---

### Task 6: 점검 이력·진행 현황 리스킨 (`/runs`, `/runs/[id]`, `/runs/batch/[batchId]`)

**Files:**
- Modify: `src/app/runs/page.tsx`
- Modify: `src/app/runs/[id]/page.tsx`, `src/app/runs/[id]/RunStatus.tsx`
- Modify: `src/app/runs/batch/[batchId]/page.tsx`

**Interfaces:**
- Consumes: `Card`, `SectionLabel`, `StatusBadge`, 공통 레시피.

참고 목업: `runs_ai.html` — "분석 파이프라인 진행 상태": 단계별 타임라인(대기/진행/완료 상태 표시)과 진행 로그 영역, AI 분석 단계 강조. `/runs` 목록과 batch 화면은 전용 목업이 없으므로 데이터 테이블 레시피 + `assets_list.html` 스타일 준용.

- [ ] **Step 1: 점검 이력 목록**

컨테이너/타이틀("점검 이력") 적용. run 테이블을 Card(p-0) + 데이터 테이블 레시피로. run 상태(성공/실패/진행중)는 `StatusBadge`(성공→pass, 실패→fail, 진행중→review, 대기→neutral — 기존 상태 문자열 매핑은 페이지의 기존 분기 로직을 그대로 사용). run ID·커밋 해시는 `font-mono`.

- [ ] **Step 2: 진행 현황(RunStatus) — 파이프라인 타임라인 스타일**

`RunStatus.tsx`의 폴링·상태 로직은 무변경. 표시만:
- 단계 목록을 세로 타임라인으로 — 각 단계 행: 좌측 상태 도트(완료 `bg-pass`, 진행 `bg-primary` + `scan-pulse-ring` 유지, 대기 `bg-neutral/40`, 실패 `bg-fail`), 단계명, 우측 `StatusBadge`.
- AI 분석 단계는 `border-primary/40 bg-primary/5` 카드로 강조 (목업의 AI 강조 대응 — 실데이터 있는 요소만).
- 로그/출력 영역은 `rounded-lg bg-[#0e1d2b] p-4 font-mono text-[12.5px] text-[#e9f1ff]` (다크 고정 터미널 블록, `terminal-cursor-blink` 유지).

- [ ] **Step 3: 배치 화면**

batch 페이지 테이블에 Step 1과 동일한 테이블·배지 레시피 적용.

- [ ] **Step 4: 검증**

Run: `npm test` → PASS. `npx eslint src/app/runs/` → 에러 없음.
dev 서버: `/runs`, run 상세(진행 중 run이 있으면 폴링 애니메이션 확인), batch 화면. 라이트/다크, `runs_ai.html` 대조.

- [ ] **Step 5: Commit**

```bash
git add src/app/runs/
git commit -m "feat: 점검 이력·진행 현황 화면을 Kinetic 디자인으로 리스킨"
```

---

### Task 7: 점검 리포트 리스킨 (`/runs/[id]/report`)

**Files:**
- Modify: `src/app/runs/[id]/report/page.tsx`, `src/app/runs/[id]/report/ReportView.tsx`

**Interfaces:**
- Consumes: `Card`, `SectionLabel`, `StatusBadge`, 공통 레시피.

참고 목업: `report_integrated.html` — 구성: 리포트 헤더("보안 점검 보고서" + 메타) → 요약 스탯 4개(Total Checks / Pass / Fail / Review) → "Claude AI 취약점 분석 (Failed Items)" 상세 카드 목록(항목별 제목 + severity + 근거/조치).

- [ ] **Step 1: 리포트 헤더·요약 스탯**

컨테이너 레시피 + 타이틀 "보안 점검 보고서", 부제에 자산명·일시(`font-mono`). 요약 스탯 4타일은 Task 4 Step 2의 KPI 타일 패턴 재사용 — Pass `text-pass`, Fail `text-fail`, Review `text-review` 숫자색.

- [ ] **Step 2: 점검 항목·AI 분석 섹션**

점검 항목 테이블(있다면)은 데이터 테이블 레시피 + 결과 `StatusBadge`. AI 분석(실패 항목) 목록은 항목별 `Card`: 헤더에 항목 제목 + severity `StatusBadge`, 본문에 기존 분석 텍스트(근거·영향·조치), 커맨드/설정값은 `font-mono` 인라인 코드(`rounded bg-bg px-1.5 py-0.5`). 다운로드/내보내기 등 기존 버튼은 Secondary 버튼 레시피.

- [ ] **Step 3: 검증 + Commit**

Run: `npm test` → PASS. `npx eslint src/app/runs/` → 에러 없음.
완료된 run의 리포트 화면을 목업과 대조(라이트/다크).

```bash
git add src/app/runs/
git commit -m "feat: 점검 리포트를 Kinetic 통합 디자인으로 리스킨"
```

---

### Task 8: 카탈로그 리스킨 (`/catalog`)

**Files:**
- Modify: `src/app/catalog/page.tsx`

**Interfaces:**
- Consumes: `Card`, `SectionLabel`, `StatusBadge`, 공통 레시피.

참고 목업: `catalog.html` — "Security Check Catalog": 카테고리 사이드 필터("Categories", "Status") + 점검 항목 테이블.

- [ ] **Step 1: 리스킨**

컨테이너/타이틀("보안 점검 카탈로그"). 현재 페이지가 단일 목록이면 목업의 사이드 필터는 **기존에 필터 기능이 있는 경우에만** 스타일 적용(기능 신설 금지 — Global Constraints). 점검 항목(U-xx/W-xx/C-xx) 코드 `font-mono`, 카테고리는 `SectionLabel` 그룹 헤더, 심각도 `StatusBadge`, 표는 데이터 테이블 레시피, 전체를 `Card`(`bodyClassName="p-0"`)로.

- [ ] **Step 2: 검증 + Commit**

Run: `npm test` → PASS. `npx eslint src/app/catalog/` → 에러 없음. dev 서버 목업 대조.

```bash
git add src/app/catalog/
git commit -m "feat: 카탈로그를 Kinetic 디자인으로 리스킨"
```

---

### Task 9: 프로젝트 화면 리스킨 (`/projects`, `/projects/[id]`)

**Files:**
- Modify: `src/app/projects/page.tsx`, `src/app/projects/ProjectForm.tsx`
- Modify: `src/app/projects/[id]/page.tsx`, `src/app/projects/[id]/ShareLinkPanel.tsx`, `src/app/projects/[id]/FleetScanButton.tsx`

**Interfaces:**
- Consumes: `Card`, `SectionLabel`, `StatusBadge`, 공통 레시피.

참고 목업: `projects.html`(프로젝트 목록 — "Projects Directory", 프로젝트별 카드에 "Grouped Assets" 요약), `projects_share.html`(상세 + "Share Settings" 패널), `share_links.html`(공유 링크·비밀번호 재설정 — ShareLinkPanel 세부 참고).

- [ ] **Step 1: 프로젝트 목록**

컨테이너/타이틀("프로젝트"). 프로젝트를 Card 목록으로 — 헤더에 프로젝트명 + 자산 수, 본문에 소속 자산 요약(상태별 `StatusBadge` 카운트). `ProjectForm` 입력·버튼 레시피 적용.

- [ ] **Step 2: 프로젝트 상세 + 공유 패널**

상세 헤더: 프로젝트명 타이틀 + `FleetScanButton`(Primary 버튼 레시피, 기존 동작 유지). 자산 목록 테이블은 데이터 테이블 레시피.
`ShareLinkPanel`: Card(title="공유 설정") — 링크 URL `font-mono` + 복사 버튼(Secondary), 비밀번호 재설정 버튼(Secondary), 위험 동작(링크 폐기 등 기존에 있다면)은 Danger 버튼. 토글·입력은 레시피.

- [ ] **Step 3: 검증 + Commit**

Run: `npm test` → PASS. `npx eslint src/app/projects/` → 에러 없음. dev 서버에서 목록·상세·공유 패널 렌더 확인, 라이트/다크, 목업 대조.

```bash
git add src/app/projects/
git commit -m "feat: 프로젝트 목록·상세·공유 설정을 Kinetic 디자인으로 리스킨"
```

---

### Task 10: 공유 뷰 리스킨 (`/share/[token]`)

**Files:**
- Modify: `src/app/share/[token]/page.tsx`, `src/app/share/[token]/ShareGate.tsx`

**Interfaces:**
- Consumes: `Card`, `SectionLabel`, `StatusBadge`, 공통 레시피.

참고 목업: `share_pm_view.html` — PM용 읽기 전용 뷰: 프로젝트 헤더 + "Asset Security Status" + "Project Details".
주의: 이 라우트는 외부 공유용 — 앱 셸(사이드바)이 있는지 현재 layout 구조를 확인하고, **현재 셸 노출 여부를 그대로 유지**한다(기능·정보 노출 변경 금지).

- [ ] **Step 1: 리스킨**

`ShareGate`(비밀번호 입력 게이트): 중앙 정렬 Card — 타이틀, 입력 필드 레시피, Primary 버튼.
통과 후 뷰: 프로젝트명 타이틀 + 자산 보안 상태 테이블(데이터 테이블 레시피 + `StatusBadge`) + 상세 정보 Card. 읽기 전용이므로 버튼 추가 금지.

- [ ] **Step 2: 검증 + Commit**

Run: `npm test` → PASS. `npx eslint src/app/share/` → 에러 없음. 유효 공유 링크로 게이트·뷰 렌더 확인(라이트/다크).

```bash
git add src/app/share/
git commit -m "feat: 공유 뷰를 Kinetic 디자인으로 리스킨"
```

---

### Task 11: DESIGN.md 갱신 + 최종 검증

**Files:**
- Modify: `DESIGN.md` (Coinbase 토큰 문서 → Kinetic 기준으로 교체)

**Interfaces:**
- Consumes: Task 1 토큰 표.

- [ ] **Step 1: DESIGN.md를 Kinetic 기준으로 교체**

기존 Coinbase 내용을 다음 구성으로 교체: 디자인 시스템명(Kinetic Security System)과 Stitch 출처(`projects/936621672799851412`), 스펙 문서 링크, Task 1의 라이트/다크 토큰 표(변수명 = `globals.css`와 동일), 형태 규칙(radius 8px 표준 / 16px 대형 / pill 배지, 그림자 금지 원칙), 타이포(Inter + JetBrains Mono), 공용 컴포넌트 사용법(`StatusBadge`/`Card`/`SectionLabel`) 및 공통 스타일 레시피 표(이 계획서의 표를 복사).

- [ ] **Step 2: 전수 검증**

Run: `npm test` → 전체 PASS
Run: `npm run lint` → 에러 없음
Run: `npm run build` → 성공
dev 서버에서 전 라우트(`/`, `/assets`, `/assets/[id]`, `/assets/new`, `/assets/upload`, `/runs`, `/runs/[id]`, `/runs/[id]/report`, `/catalog`, `/projects`, `/projects/[id]`, `/share/[token]`) 라이트/다크 최종 순회. `[var(--color-*)]` 아비트러리 표기 잔존 여부 확인: `grep -rn 'var(--color-' src/app --include='*.tsx'` — 남은 곳은 테마 유틸리티로 정리.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs: DESIGN.md를 Kinetic Security System 기준으로 갱신"
```
