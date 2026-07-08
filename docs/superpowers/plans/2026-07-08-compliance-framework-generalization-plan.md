# B: 컴플라이언스 프레임워크 일반화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KISA를 유일한 프레임워크로 유지하면서, 카탈로그 데이터 모델에 `Framework` 개념을 도입해 향후 프레임워크 추가가 "새 JSON 데이터 파일 + 레지스트리 등록"만으로 끝나도록 만든다.

**Architecture:** `src/lib/catalog/`에 `Framework` 타입과 `FRAMEWORKS` 레지스트리를 추가하고, 하드코딩된 카테고리별 import를 선언적 `CATALOG_SOURCES` 목록으로 바꿔 각 항목에 `frameworkId`를 태깅한다. `Category`, 파이프라인(`checks/`, `claude/`, `runs`) 코드는 건드리지 않는다. `/api/catalog`와 `/catalog` 페이지에 프레임워크 표시를 추가한다.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest.

## Global Constraints

- `Category`(`container`|`unix`|`web`) 타입은 이번 스코프에서 변경하지 않는다 (spec: checks/claude/runs 전반에서 쓰이므로).
- 프레임워크 선택/필터 UI는 만들지 않는다 (spec: 옵션 1개뿐인 필터는 죽은 UI).
- Ansible 룰 ID 네임스페이싱, DB 스키마 변경, Claude 프롬프트 변경은 하지 않는다 (spec: 다른 서브 프로젝트 또는 범위 밖).
- 현재 전체 카탈로그 항목 수는 102개 (container 9 + unix 67 + web 26, 2026-07-08 WEB-01~WEB-26 KISA 가이드 정합화 이후 기준) — 이 총합은 이번 작업으로 변하지 않는다.

---

## Task 1: 프레임워크 레지스트리 + 카탈로그 로더 재구성

**Files:**
- Modify: `src/lib/catalog/types.ts`
- Create: `src/lib/catalog/frameworks.ts`
- Modify: `src/lib/catalog/index.ts`
- Move: `src/lib/catalog/data/container.json` → `src/lib/catalog/data/kisa/container.json`
- Move: `src/lib/catalog/data/unix.json` → `src/lib/catalog/data/kisa/unix.json`
- Move: `src/lib/catalog/data/web.json` → `src/lib/catalog/data/kisa/web.json`
- Test: `src/lib/catalog/index.test.ts`

**Interfaces:**
- Produces: `Framework` interface (`{ id: string; name: string; docVersion?: string }`) from `src/lib/catalog/types.ts`; `CatalogItem.frameworkId: string` field; `FRAMEWORKS: Framework[]` from `src/lib/catalog/frameworks.ts`; `getFrameworks(): Framework[]` from `src/lib/catalog/index.ts`; `CatalogSummary.byFramework: Record<string, number>`.
- Consumes: nothing from other tasks (this is the foundation task).

- [ ] **Step 1: Write the failing tests**

Open `src/lib/catalog/index.test.ts` and replace its contents with:

```ts
import { describe, expect, it } from "vitest";
import { getCatalog, getCatalogItem, getCatalogSummary, getFrameworks } from "./index";

describe("catalog", () => {
  it("loads all 102 items across the three categories", () => {
    const summary = getCatalogSummary();
    expect(summary.total).toBe(102);
    expect(summary.byCategory.container).toBe(9);
    expect(summary.byCategory.unix).toBe(67);
    expect(summary.byCategory.web).toBe(26);
  });

  it("has no duplicate ids", () => {
    const ids = getCatalog().map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds a known item by id and assigns its category", () => {
    expect(getCatalogItem("C-01")).toMatchObject({
      category: "container",
      severity: "High",
    });
    expect(getCatalogItem("U-16")).toMatchObject({
      category: "unix",
      title: "/etc/passwd 파일 소유자 및 권한 설정",
    });
    expect(getCatalogItem("WEB-26")).toMatchObject({ category: "web" });
    expect(getCatalogItem("does-not-exist")).toBeUndefined();
  });

  it("marks the MVP first-wave items (C-01, C-02, U-16) as automated", () => {
    expect(getCatalogItem("C-01")?.automationStatus).toBe("automated");
    expect(getCatalogItem("C-02")?.automationStatus).toBe("automated");
    expect(getCatalogItem("U-16")?.automationStatus).toBe("automated");
  });

  it("tags every item with a frameworkId registered in getFrameworks()", () => {
    const registeredIds = new Set(getFrameworks().map((framework) => framework.id));
    for (const item of getCatalog()) {
      expect(registeredIds.has(item.frameworkId)).toBe(true);
    }
  });

  it("registers KISA as the only framework, covering all 102 items", () => {
    const frameworks = getFrameworks();
    expect(frameworks).toHaveLength(1);
    expect(frameworks[0]).toMatchObject({
      id: "kisa",
      name: "KISA 주요정보통신기반시설 가이드",
    });

    const summary = getCatalogSummary();
    expect(summary.byFramework.kisa).toBe(102);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/catalog/index.test.ts`
Expected: FAIL — `getFrameworks` is not exported from `./index`, and TypeScript errors about missing `frameworkId`.

- [ ] **Step 3: Add the `Framework` type and extend `CatalogItem`**

In `src/lib/catalog/types.ts`, insert the `Framework` interface after the `AutomationStatus` type declaration (line 7), and add `frameworkId` to `CatalogItem`:

```ts
export type Category = "container" | "unix" | "web";

export type Severity = "Critical" | "High" | "Medium" | "Low";

// Whether this catalog item has an automated Ansible rule at all in MVP scope.
// Distinct from CheckStatus, which is the per-run outcome of that rule.
export type AutomationStatus = "automated" | "not_automated";

export interface Framework {
  id: string;
  name: string;
  docVersion?: string;
}

export interface CatalogItem {
  id: string;
  category: Category;
  frameworkId: string;
  title: string;
  severity: Severity;
  automationStatus: AutomationStatus;
}
```

(The rest of `types.ts` — `CheckStatus`, `CHECK_STATUS_LABELS`, `CATEGORY_LABELS` — stays unchanged.)

- [ ] **Step 4: Create the framework registry**

Create `src/lib/catalog/frameworks.ts`:

```ts
import type { Framework } from "./types";

export const FRAMEWORKS: Framework[] = [
  { id: "kisa", name: "KISA 주요정보통신기반시설 가이드" },
];
```

- [ ] **Step 5: Move the data files under a `kisa/` folder**

```bash
mkdir -p src/lib/catalog/data/kisa
git mv src/lib/catalog/data/container.json src/lib/catalog/data/kisa/container.json
git mv src/lib/catalog/data/unix.json src/lib/catalog/data/kisa/unix.json
git mv src/lib/catalog/data/web.json src/lib/catalog/data/kisa/web.json
```

- [ ] **Step 6: Rewrite the catalog loader**

Replace the contents of `src/lib/catalog/index.ts` with:

```ts
import containerData from "./data/kisa/container.json";
import unixData from "./data/kisa/unix.json";
import webData from "./data/kisa/web.json";
import { FRAMEWORKS } from "./frameworks";
import type { CatalogItem, Category, Framework } from "./types";

type RawItem = Omit<CatalogItem, "category" | "frameworkId">;

interface CatalogSource {
  frameworkId: string;
  category: Category;
  data: RawItem[];
}

// Adding a new framework: write its JSON data file(s), register it in
// FRAMEWORKS (./frameworks.ts), then add one entry per category here.
// No other code in this file needs to change.
const CATALOG_SOURCES: CatalogSource[] = [
  { frameworkId: "kisa", category: "container", data: containerData as RawItem[] },
  { frameworkId: "kisa", category: "unix", data: unixData as RawItem[] },
  { frameworkId: "kisa", category: "web", data: webData as RawItem[] },
];

const CATALOG: CatalogItem[] = CATALOG_SOURCES.flatMap(({ frameworkId, category, data }) =>
  data.map((item) => ({ ...item, category, frameworkId })),
);

export function getCatalog(): CatalogItem[] {
  return CATALOG;
}

export function getCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

export function getCatalogByCategory(category: Category): CatalogItem[] {
  return CATALOG.filter((item) => item.category === category);
}

export function getFrameworks(): Framework[] {
  return FRAMEWORKS;
}

export interface CatalogSummary {
  total: number;
  byCategory: Record<Category, number>;
  byFramework: Record<string, number>;
  automated: number;
  notAutomated: number;
}

export function getCatalogSummary(): CatalogSummary {
  const byFramework: Record<string, number> = {};
  for (const framework of FRAMEWORKS) {
    byFramework[framework.id] = CATALOG.filter(
      (item) => item.frameworkId === framework.id,
    ).length;
  }

  return {
    total: CATALOG.length,
    byCategory: {
      container: getCatalogByCategory("container").length,
      unix: getCatalogByCategory("unix").length,
      web: getCatalogByCategory("web").length,
    },
    byFramework,
    automated: CATALOG.filter((item) => item.automationStatus === "automated").length,
    notAutomated: CATALOG.filter((item) => item.automationStatus === "not_automated").length,
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- src/lib/catalog/index.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. This catches any other file that constructs a `CatalogItem` literal without `frameworkId` (there shouldn't be any outside `index.ts`, but this is the cheap way to confirm).

- [ ] **Step 9: Commit**

```bash
git add src/lib/catalog/types.ts src/lib/catalog/frameworks.ts src/lib/catalog/index.ts src/lib/catalog/index.test.ts src/lib/catalog/data/kisa
git commit -m "feat: 카탈로그에 Framework 레지스트리 도입 (KISA 단일 등록)"
```

---

## Task 2: `/api/catalog` 응답에 프레임워크 목록 노출

**Files:**
- Modify: `src/app/api/catalog/route.ts`
- Test: `src/app/api/catalog/route.test.ts` (신규)

**Interfaces:**
- Consumes: `getCatalog`, `getCatalogSummary`, `getFrameworks` from `src/lib/catalog/index.ts` (Task 1).
- Produces: `GET()` response shape `{ summary, items, frameworks }` — later tasks don't depend on this, but this is the contract the frontend (Task 3, and any future consumer) relies on.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/catalog/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/catalog", () => {
  it("includes the framework registry alongside items and summary", async () => {
    const response = GET();
    const body = await response.json();

    expect(body.frameworks).toEqual([
      { id: "kisa", name: "KISA 주요정보통신기반시설 가이드" },
    ]);
    expect(body.summary.byFramework.kisa).toBe(102);
    expect(body.items[0].frameworkId).toBe("kisa");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/catalog/route.test.ts`
Expected: FAIL — `body.frameworks` is `undefined`.

- [ ] **Step 3: Implement**

Replace `src/app/api/catalog/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getCatalog, getCatalogSummary, getFrameworks } from "@/lib/catalog";

export function GET() {
  return NextResponse.json({
    summary: getCatalogSummary(),
    items: getCatalog(),
    frameworks: getFrameworks(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/catalog/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/catalog/route.ts src/app/api/catalog/route.test.ts
git commit -m "feat: /api/catalog 응답에 frameworks 필드 추가"
```

---

## Task 3: `/catalog` 페이지에 프레임워크 표시

**Files:**
- Modify: `src/app/catalog/page.tsx`

**Interfaces:**
- Consumes: `getCatalogByCategory`, `getCatalogSummary`, `getFrameworks` from `src/lib/catalog/index.ts` (Task 1); `CatalogItem.frameworkId`.
- Produces: nothing consumed by other tasks (leaf task).

- [ ] **Step 1: Implement**

Replace `src/app/catalog/page.tsx` with:

```tsx
import { getCatalogByCategory, getCatalogSummary, getFrameworks } from "@/lib/catalog";
import { CATEGORY_LABELS, type Category } from "@/lib/catalog/types";

const CATEGORIES: Category[] = ["container", "unix", "web"];

const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-slate-100 text-slate-700",
};

export default function CatalogPage() {
  const summary = getCatalogSummary();
  const frameworks = getFrameworks();
  const frameworkNames = new Map(frameworks.map((framework) => [framework.id, framework.name]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold">점검 항목 카탈로그</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        컨테이너/이미지 하드닝, KISA 가이드 기반 Unix·웹서비스 점검 항목 총{" "}
        {summary.total}개 (자동화 {summary.automated} · 자동화 전 {summary.notAutomated})
      </p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        기준 프레임워크:{" "}
        {frameworks
          .map((framework) => `${framework.name} (${summary.byFramework[framework.id]}개)`)
          .join(", ")}
      </p>

      {CATEGORIES.map((category) => {
        const items = getCatalogByCategory(category);
        return (
          <section key={category} className="mt-8">
            <h2 className="text-lg font-medium">
              {CATEGORY_LABELS[category]}{" "}
              <span className="text-sm font-normal text-[var(--color-muted)]">
                ({items.length}개)
              </span>
            </h2>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">항목</th>
                  <th className="py-2 pr-4">프레임워크</th>
                  <th className="py-2 pr-4">심각도</th>
                  <th className="py-2 pr-4">자동화 상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 pr-4 font-mono">{item.id}</td>
                    <td className="py-2 pr-4">{item.title}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-[var(--radius-nh)] bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {frameworkNames.get(item.frameworkId) ?? item.frameworkId}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-[var(--radius-nh)] px-2 py-0.5 text-xs ${
                          SEVERITY_STYLES[item.severity]
                        }`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-[var(--color-muted)]">
                      {item.automationStatus === "automated" ? "자동화" : "자동화 전"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify in the browser**

```bash
npm run dev &
DEV_PID=$!
sleep 3
curl -s http://localhost:3000/catalog | grep -o "프레임워크" | head -1
curl -s http://localhost:3000/catalog | grep -o "KISA 주요정보통신기반시설 가이드" | head -1
kill $DEV_PID
```

Expected: both `curl` calls print a match (the page renders the "프레임워크" column header and the "KISA 주요정보통신기반시설 가이드" framework name). If either is empty, open `http://localhost:3000/catalog` in a browser and inspect manually before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/app/catalog/page.tsx
git commit -m "feat: 카탈로그 페이지에 프레임워크 컬럼/요약 표시"
```
