# 첫 사용자 온보딩 코치마크 투어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 사용자(자산 0개)가 대시보드에 들어오면 자동으로 뜨는 안내형 코치마크 투어로 자산 등록 → 전체 점검 → 분석 결과 확인 위치를 6단계로 안내하고, [도움말] 버튼으로 재실행한다.

**Architecture:** 스텝 데이터와 트리거 판단은 `src/lib/onboarding/steps.ts`의 순수 함수/상수로 분리해 단위 테스트하고, 스포트라이트+말풍선 오버레이는 client 컴포넌트 `OnboardingTour`로 렌더한다. 앵커는 대상 요소의 `data-tour` 속성으로 찾고, 없으면 중앙 말풍선으로 폴백한다. 기억은 localStorage, 재실행은 헤더 [도움말] 버튼 + sessionStorage force 플래그.

**Tech Stack:** Next.js App Router(client component), React useState/useEffect, localStorage/sessionStorage, Tailwind v4 토큰, vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-onboarding-tour-design.md`

## Global Constraints

- 테스트/빌드는 Node 24: 모든 명령 앞에 `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` (기본 node 18은 vitest 불가).
- 커밋 메시지: `feat|fix|docs: 한국어 요약 (#onboarding-tour)` + 트레일러 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 백엔드·DB·마이그레이션 변경 금지 — 프론트엔드만. 기억은 `localStorage["nhg_onboarding_done"]`, 재실행 force는 `sessionStorage["nhg_onboarding_force"]`.
- 자동 시작 조건: `assetCount === 0 && !seen` (첫 사용자).
- UI 문구는 한국어. 스텝 6개·순서·문구는 스펙 표 그대로.
- localStorage/DOM 접근은 `useEffect`(마운트 후)에서만 — SSR 하이드레이션 불일치 금지.

---

### Task 1: 스텝 데이터 + shouldAutoStart 순수 모듈

**Files:**
- Create: `src/lib/onboarding/steps.ts`
- Test: `src/lib/onboarding/steps.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `interface OnboardingStep { key: string; anchor: string | null; title: string; body: string; placement: "center" | "auto"; cta?: { label: string; href: string } }`
  - `const ONBOARDING_STEPS: OnboardingStep[]` (6개, 순서 고정)
  - `function shouldAutoStart(assetCount: number, seen: boolean): boolean`
  - `const ONBOARDING_DONE_KEY = "nhg_onboarding_done"`, `const ONBOARDING_FORCE_KEY = "nhg_onboarding_force"`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/onboarding/steps.test.ts
import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  shouldAutoStart,
  ONBOARDING_DONE_KEY,
  ONBOARDING_FORCE_KEY,
} from "./steps";

describe("shouldAutoStart", () => {
  it("자산 0개 + 미열람이면 자동 시작한다", () => {
    expect(shouldAutoStart(0, false)).toBe(true);
  });
  it("이미 열람했으면 자동 시작하지 않는다", () => {
    expect(shouldAutoStart(0, true)).toBe(false);
  });
  it("자산이 있으면(첫 사용자 아님) 자동 시작하지 않는다", () => {
    expect(shouldAutoStart(3, false)).toBe(false);
    expect(shouldAutoStart(3, true)).toBe(false);
  });
});

describe("ONBOARDING_STEPS", () => {
  it("6개 스텝이 고정 순서로 있다", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      "welcome", "register", "group-scan", "progress", "results", "done",
    ]);
  });
  it("key가 유일하다", () => {
    const keys = ONBOARDING_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("center 스텝은 anchor가 null, auto 스텝은 anchor 문자열을 가진다", () => {
    for (const s of ONBOARDING_STEPS) {
      if (s.placement === "center") expect(s.anchor).toBeNull();
      else expect(typeof s.anchor).toBe("string");
    }
  });
  it("마지막 스텝(done)은 자산 등록 CTA를 가진다", () => {
    const last = ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1];
    expect(last.key).toBe("done");
    expect(last.cta).toEqual({ label: "자산 등록하기", href: "/assets/new" });
  });
  it("auto 스텝의 anchor는 실제로 부여할 data-tour 키와 일치한다", () => {
    const anchors = ONBOARDING_STEPS.filter((s) => s.anchor).map((s) => s.anchor);
    expect(anchors).toEqual(["asset-register", "nav-assets", "nav-runs", "dashboard-score"]);
  });
  it("localStorage/sessionStorage 키 상수", () => {
    expect(ONBOARDING_DONE_KEY).toBe("nhg_onboarding_done");
    expect(ONBOARDING_FORCE_KEY).toBe("nhg_onboarding_force");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/onboarding/steps.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// src/lib/onboarding/steps.ts
export interface OnboardingStep {
  key: string;
  anchor: string | null; // data-tour 값. center 스텝이면 null
  title: string;
  body: string;
  placement: "center" | "auto";
  cta?: { label: string; href: string };
}

export const ONBOARDING_DONE_KEY = "nhg_onboarding_done";
export const ONBOARDING_FORCE_KEY = "nhg_onboarding_force";

// 첫 사용자(자산 0개)가 아직 투어를 보지 않았으면 자동 시작한다.
export function shouldAutoStart(assetCount: number, seen: boolean): boolean {
  return assetCount === 0 && !seen;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "welcome",
    anchor: null,
    placement: "center",
    title: "환영합니다",
    body: "NH-Guardian에 오신 걸 환영합니다. 3단계로 첫 점검을 안내할게요.",
  },
  {
    key: "register",
    anchor: "asset-register",
    placement: "auto",
    title: "① 자산 등록",
    body: "점검할 서버·레포를 등록하세요. 엑셀 업로드로 여러 개를 한 번에 올릴 수 있어요.",
  },
  {
    key: "group-scan",
    anchor: "nav-assets",
    placement: "auto",
    title: "② 프로젝트로 묶고 점검",
    body: "자산을 프로젝트로 묶고, 체크박스로 선택해 일괄 점검하거나 프로젝트에서 전체(Fleet) 점검을 실행하세요.",
  },
  {
    key: "progress",
    anchor: "nav-runs",
    placement: "auto",
    title: "③ 점검 진행",
    body: "점검이 시작되면 단계·진행률이 실시간으로 표시됩니다.",
  },
  {
    key: "results",
    anchor: "dashboard-score",
    placement: "auto",
    title: "④ 분석 결과",
    body: "완료되면 대시보드 점수·활동 피드에 반영되고, 각 점검 리포트에서 취약 항목·CVE·AI 분석 상세를 봅니다.",
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

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/onboarding/steps.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/onboarding/steps.ts src/lib/onboarding/steps.test.ts
git commit -m "feat: 온보딩 투어 스텝 데이터·자동시작 판단 (#onboarding-tour)"
```

---

### Task 2: OnboardingTour 오버레이 컴포넌트

**Files:**
- Create: `src/app/_components/onboarding/OnboardingTour.tsx`

**Interfaces:**
- Consumes: `ONBOARDING_STEPS`, `shouldAutoStart`, `ONBOARDING_DONE_KEY`, `ONBOARDING_FORCE_KEY`, `OnboardingStep` (Task 1)
- Produces: `<OnboardingTour assetCount={number} />` (client component, default export 아님 — named export `OnboardingTour`)

- [ ] **Step 1: 구현 (UI 컴포넌트 — 단위 테스트 대신 tsc·eslint·실물 검증)**

```tsx
// src/app/_components/onboarding/OnboardingTour.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ONBOARDING_STEPS,
  ONBOARDING_DONE_KEY,
  ONBOARDING_FORCE_KEY,
  shouldAutoStart,
  type OnboardingStep,
} from "@/lib/onboarding/steps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// 대상 요소의 화면 위치. 요소가 없으면 null → 중앙 말풍선 폴백.
function anchorRect(anchor: string | null): Rect | null {
  if (!anchor) return null;
  const el = document.querySelector(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function OnboardingTour({ assetCount }: { assetCount: number }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // 마운트 후에만 localStorage/sessionStorage·DOM 접근 (SSR 안전)
  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
    const forced = sessionStorage.getItem(ONBOARDING_FORCE_KEY) === "1";
    if (forced) {
      sessionStorage.removeItem(ONBOARDING_FORCE_KEY);
      setIndex(0);
      setActive(true);
    } else if (shouldAutoStart(assetCount, seen)) {
      setActive(true);
    }
  }, [assetCount]);

  const step: OnboardingStep | undefined = active ? ONBOARDING_STEPS[index] : undefined;

  // 현재 스텝의 앵커 위치 계산 + 리사이즈/스크롤 시 재계산
  useEffect(() => {
    if (!step) return;
    const update = () => setRect(anchorRect(step.anchor));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= ONBOARDING_STEPS.length - 1) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, next, prev]);

  if (!active || !step) return null;

  const isLast = index === ONBOARDING_STEPS.length - 1;
  const pad = 6;
  // 말풍선 위치: 앵커가 있으면 그 아래(공간 없으면 위), 없으면 화면 중앙
  const tooltipStyle: React.CSSProperties =
    rect && step.placement === "auto"
      ? (() => {
          const below = rect.top + rect.height + 12;
          const placeBelow = below + 180 < window.innerHeight;
          return {
            position: "fixed",
            top: placeBelow ? below : Math.max(12, rect.top - 12 - 180),
            left: Math.min(Math.max(12, rect.left), window.innerWidth - 332),
            width: 320,
          };
        })()
      : { position: "fixed", top: "50%", left: "50%", width: 320, transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {/* 딤 오버레이 (스포트라이트 있으면 대상 영역만 밝게 뚫는 대신, 4-변 딤 대신 단순 반투명 + 하이라이트 링) */}
      <div className="absolute inset-0 bg-black/50" onClick={finish} />
      {/* 스포트라이트 하이라이트 링 (앵커가 있을 때만) */}
      {rect && step.placement === "auto" && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary ring-offset-2"
          style={{
            position: "fixed",
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            borderRadius: 12,
          }}
        />
      )}
      {/* 말풍선 */}
      <div
        style={tooltipStyle}
        className="rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[12px] font-mono text-muted">
          {index + 1} / {ONBOARDING_STEPS.length}
        </div>
        <h3 id="onboarding-title" className="text-[16px] font-bold">
          {step.title}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{step.body}</p>

        {step.cta && (
          <Link
            href={step.cta.href}
            onClick={finish}
            className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            {step.cta.label}
          </Link>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={finish} className="text-[12.5px] text-muted hover:underline">
            건너뛰기
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium hover:bg-bg"
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
            >
              {isLast ? "완료" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

주의: 스포트라이트 링의 `boxShadow: 0 0 0 9999px rgba(0,0,0,0.5)`가 딤을 만들므로, 앵커가 있는 스텝에서는 아래의 전체 `bg-black/50` 딤과 이중으로 겹쳐 더 어두워질 수 있다. 앵커 스텝에서는 전체 딤을 투명하게 두는 편이 자연스럽다 — 아래 조정: 전체 딤 div의 배경을 `rect && step.placement==="auto" ? "transparent" : "rgba(0,0,0,0.5)"`로. 구현 시 이 한 줄을 반영하라(전체 딤 클릭 닫기는 유지):

```tsx
      <div
        className="absolute inset-0"
        style={{ background: rect && step.placement === "auto" ? "transparent" : "rgba(0,0,0,0.5)" }}
        onClick={finish}
      />
```

- [ ] **Step 2: 게이트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/onboarding/OnboardingTour.tsx`
Expected: 클린

- [ ] **Step 3: 커밋**

```bash
git add src/app/_components/onboarding/OnboardingTour.tsx
git commit -m "feat: 온보딩 스포트라이트·말풍선 오버레이 컴포넌트 (#onboarding-tour)"
```

---

### Task 3: HelpButton (헤더 재실행 버튼)

**Files:**
- Create: `src/app/_components/onboarding/HelpButton.tsx`
- Modify: `src/app/_components/AppHeader.tsx` (import + ThemeToggle 옆에 배치)

**Interfaces:**
- Consumes: `ONBOARDING_FORCE_KEY` (Task 1)
- Produces: `<HelpButton />` (client)

- [ ] **Step 1: HelpButton 구현**

```tsx
// src/app/_components/onboarding/HelpButton.tsx
"use client";

import { ONBOARDING_FORCE_KEY } from "@/lib/onboarding/steps";

// 온보딩 투어를 수동 재실행한다. 투어는 대시보드(/)에 마운트돼 있으므로,
// force 플래그를 세팅한 뒤 /로 전체 이동해(대시보드가 아니면 이동, 맞으면
// 재마운트) 자산 수·열람 여부와 무관하게 투어를 시작시킨다.
export function HelpButton() {
  function start() {
    sessionStorage.setItem(ONBOARDING_FORCE_KEY, "1");
    window.location.assign("/");
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

- [ ] **Step 2: AppHeader에 배치**

`src/app/_components/AppHeader.tsx`에서 import 추가:

```tsx
import { HelpButton } from "./onboarding/HelpButton";
```

`<ThemeToggle />` 바로 앞에 `<HelpButton />`를 넣는다 — 기존:
```tsx
        <ThemeToggle />
      </div>
```
변경:
```tsx
        <HelpButton />
        <ThemeToggle />
      </div>
```

- [ ] **Step 3: 게이트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/onboarding/HelpButton.tsx src/app/_components/AppHeader.tsx`
Expected: 클린

- [ ] **Step 4: 커밋**

```bash
git add src/app/_components/onboarding/HelpButton.tsx src/app/_components/AppHeader.tsx
git commit -m "feat: 헤더 [도움말] 온보딩 재실행 버튼 (#onboarding-tour)"
```

---

### Task 4: 앵커 data-tour 부여 + 대시보드에 투어 마운트

**Files:**
- Modify: `src/app/_components/AppSidebar.tsx` (nav Link에 조건부 data-tour)
- Modify: `src/app/page.tsx` (자산 등록 링크·종합 점수 카드에 data-tour, `<OnboardingTour>` 마운트)

**Interfaces:**
- Consumes: `<OnboardingTour>` (Task 2)
- Produces: DOM에 `data-tour` 앵커 4종(`asset-register`, `nav-assets`, `nav-runs`, `dashboard-score`)

- [ ] **Step 1: 사이드바 nav에 data-tour 부여**

`src/app/_components/AppSidebar.tsx`의 `NAV_ITEMS.map(...)` Link에 href 기준 data-tour를 추가한다. 기존 Link 여는 태그에 속성 추가:

```tsx
          <Link
            key={item.href}
            href={item.href}
            data-tour={item.href === "/assets" ? "nav-assets" : item.href === "/runs" ? "nav-runs" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ${
              isActiveNav(pathname, item)
                ? "bg-primary font-semibold text-white"
                : "text-muted hover:bg-bg hover:text-text"
            }`}
          >
```

- [ ] **Step 2: 대시보드 자산 등록 버튼·점수 카드에 data-tour + 투어 마운트**

`src/app/page.tsx`:

import 추가(파일 상단 import 블록):
```tsx
import { OnboardingTour } from "./_components/onboarding/OnboardingTour";
```

헤더의 `자산 등록` Link에 `data-tour="asset-register"` 추가 — 기존:
```tsx
        <Link
          href="/assets/new"
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          자산 등록
        </Link>
```
변경(속성 한 줄 추가):
```tsx
        <Link
          href="/assets/new"
          data-tour="asset-register"
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          자산 등록
        </Link>
```

종합 보안 점수 카드에 `data-tour="dashboard-score"` 부여 — 기존:
```tsx
              <Card title="종합 보안 점수">
                <SecurityScoreGauge score={score} grade={grade} />
              </Card>
```
`Card`는 `data-tour`를 직접 받지 못하므로 감싸는 div에 부여(레이아웃 영향 없이 contents 래퍼):
```tsx
              <div data-tour="dashboard-score">
                <Card title="종합 보안 점수">
                  <SecurityScoreGauge score={score} grade={grade} />
                </Card>
              </div>
```
주의: 이 카드가 `grid gap-4 md:grid-cols-2`의 자식이므로, 래퍼 div가 그리드 셀이 된다(기존 Card가 셀이던 것을 대체) — 레이아웃 동일하게 유지됨. 만약 Card가 이미 그리드 자식으로 특정 클래스를 요구하면 래퍼에 그 클래스를 옮긴다(현재는 특별 클래스 없음).

투어 마운트: `<main>` 최상단(AutoRefresh 근처)에 자산이 있든 없든 마운트하되, 컴포넌트 내부에서 자동 시작을 판단하므로 항상 렌더한다. 빈 상태 분기와 무관하게 `<main>` 바로 안, `<AutoRefresh ... />` 다음 줄에 추가:
```tsx
      <AutoRefresh active={anyRunning} />
      <OnboardingTour assetCount={assets.length} />
```

- [ ] **Step 3: 게이트 + 전체 테스트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/page.tsx" src/app/_components/AppSidebar.tsx && npx vitest run 2>&1 | tail -3`
Expected: tsc·eslint 클린, 전체 테스트 PASS(+7 from Task 1)

- [ ] **Step 4: 실물 검증 (dev 서버)**

전제: dev 서버가 localhost:3000에서 동작, 자산 0개 상태(온보딩 자동 시작 조건). 로그인 세션은 유저가 브라우저에서 보유.

브라우저에서 `http://localhost:3000/` 접속(자산 0개):
- 진입 시 온보딩 모달(환영, 1/6) 자동 표시
- [다음]으로 6단계 진행 — ②③④에서 자산 등록 버튼/사이드바 자산 관리·점검 이력/점수 카드에 스포트라이트 링
- 마지막(6/6)에서 [자산 등록하기] CTA → /assets/new 이동 + 닫힘
- 새로고침 시 다시 안 뜸(localStorage 기록)
- 헤더 [도움말] 클릭 → 투어 재시작
- `Esc`/[건너뛰기]로 닫힘

curl로는 자동 시작이 JS 실행 후이므로, 최소한 마크업/컴포넌트가 에러 없이 렌더되는지 확인:
```bash
curl -s -o /dev/null -w "dashboard: %{http_code}\n" http://localhost:3000/
```
(로그인 세션 쿠키 필요 — 유저 확인. 500이 아니면 컴포넌트 로드 정상.)

- [ ] **Step 5: 커밋**

```bash
git add "src/app/page.tsx" src/app/_components/AppSidebar.tsx
git commit -m "feat: 온보딩 앵커(data-tour) 부여·대시보드 투어 마운트 (#onboarding-tour)"
```
