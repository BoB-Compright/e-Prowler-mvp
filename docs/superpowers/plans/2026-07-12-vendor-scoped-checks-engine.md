# 벤더 기반 점검 선택 엔진 (#0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자산의 수집된 `category`/`vendor`로 적용 점검셋을 선택하는 "벤더 팩" 구조와 선택 엔진을 만들고, 기존 nginx/unix/container 점검을 이 구조로 이관하며(동작 보존), 카탈로그·리포트에 컴플라이언스(프레임워크) 필터를 추가한다.

**Architecture:** 각 점검군을 자기 완결적 `VendorPack`(담당 category/vendor, 실행경로, 벤더 전용 증거수집 태스크, 탐지, 평가)으로 표현한다. `resolveCheckPlan(asset)`가 자산의 `sourceType`으로 베이스라인 팩(server→os-unix, repo/image→container)을, `category`+`vendor`로 벤더 팩을 골라 합성한다. 베이스라인 증거(C-*/U-*)는 기존 `ansible/security-checks.yml`에 그대로 두고(항상 실행), **벤더 전용 증거만** 팩이 `PlaybookTask[]`로 소유해 실행 시 base 플레이북에 append한다. 선언 벤더가 기준이며, 팩의 SW가 호스트에서 미탐지면 그 팩 항목은 `skip`이 아닌 `review`로 판정한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest, Ansible(raw over docker/ssh).

## Global Constraints

- Node 24로 테스트 실행: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 `npx vitest run`.
- 게이트(모든 커밋 전): `npx tsc --noEmit` && `npx eslint <touched files>` && 관련 vitest 통과.
- 인증 실패 시 원시 credential/stderr를 노출하지 않는다(기존 제약 유지).
- 출처 표기는 대등하게: `source:{framework, ref}`만 저장, "KISA 아님" 같은 부정 문구 금지.
- 없는 출처는 지어내지 않는다. 이번 플랜의 신규 항목은 없음(기존 KISA 항목 재사용) — `source.ref`는 리포의 `web 점검 컴플라이언스.MD`/기존 카탈로그 근거만 사용.
- 동작 보존(정정, 2026-07-12 최종리뷰 결정): 각 팩이 조합하는 **평가기(evaluator) 자체의 판정은 이관 전후 동일**해야 하며, 기존 `ruleEvaluation.test.ts` 등 단위 테스트는 수정 없이 통과해야 한다. 단, **자산별 집계 범위는 자산 유형에 맞게 스코프**된다 — repo/이미지 자산은 `container`(C-*)만 적용하고 U-*(OS 서버 하드닝)는 제외한다(이전에는 컨테이너 안에서도 U-*를 평가했으나, 이는 컨테이너 이미지에 부적합한 노이즈였음). server 자산은 os-unix(U-*) 베이스라인을 유지한다.
- 기존 파일 삭제 전 그 내용을 확인하고, 설명과 다르면 진행 대신 보고.

---

## File Structure

**신규**
- `src/lib/packs/types.ts` — `PlaybookTask`, `EvalContext`, `VendorPack`, `CheckPlan` 인터페이스.
- `src/lib/packs/playbook.ts` — `mergeEvidenceTasks()`, `buildPlaybook()`(base YAML + 벤더 태스크 append).
- `src/lib/packs/osUnix.ts` — `osUnixPack`(server 베이스라인; U-01..U-67 평가기 조합).
- `src/lib/packs/container.ts` — `containerPack`(repo/image 베이스라인; C-01..C-09 평가기 조합).
- `src/lib/packs/webNginx.ts` — `webNginxPack`(WEB-01..26 nginx 평가 + nginx 증거 태스크 + detect).
- `src/lib/packs/registry.ts` — 팩 등록, `findVendorPack(category, vendor)`, `allPacks`.
- `src/lib/packs/resolve.ts` — `resolveCheckPlan(asset)`, `evaluatePack(pack, ctx)`, `evaluatePlan(plan, ctx)`.
- 각 위 파일의 `.test.ts`.

**수정**
- `src/lib/catalog/types.ts` — `CatalogItem.source`, `Category`에 `was`/`db` 추가(값만; 데이터는 후속).
- `src/lib/catalog/data/kisa/{container,unix,web}.json` — 각 항목에 `source` 추가.
- `src/lib/catalog/frameworks.ts` — CIS 프레임워크 등록.
- `src/lib/catalog/filter.ts` — `compliance`(frameworkId) 필터 축 + `parseComplianceParam`.
- `src/app/catalog/page.tsx`, `src/app/catalog/FilterPanel.tsx` — category 파라미터 명칭 정리 + compliance 필터 UI + 출처 배지.
- `ansible/security-checks.yml` — nginx 전용 태스크(줄 583–648)를 제거(webNginx 팩으로 이관).
- `src/lib/checks/ansibleRunner.ts` — `runAnsibleChecks`/`runAnsibleForServer`가 벤더 증거 태스크를 받아 합성 플레이북 실행.
- `src/lib/checks/index.ts`(`runAllChecks`) — `resolveCheckPlan` 기반으로 재작성.
- `src/lib/pipeline/orchestrator.ts`, `src/lib/pipeline/serverScan.ts` — 평가를 `evaluatePlan`으로 전환, 벤더 증거 태스크 전달.
- `src/lib/db/index.ts` — `check_results.framework_id` ADD COLUMN 마이그레이션.
- `src/lib/checks/store.ts`, `src/lib/checks/types.ts` — `frameworkId` 저장/조회, `DecoratedCheckResult` 출처.
- `src/app/runs/[id]/report/ReportView.tsx` — 컴플라이언스 필터 + 출처 배지.

---

## Task 1: 카탈로그 항목에 출처(`source`) 추가 + CIS 프레임워크 등록

**Files:**
- Modify: `src/lib/catalog/types.ts`
- Modify: `src/lib/catalog/frameworks.ts`
- Modify: `src/lib/catalog/data/kisa/container.json`, `unix.json`, `web.json`
- Test: `src/lib/catalog/index.test.ts`

**Interfaces:**
- Produces: `CatalogItem.source: { framework: string; ref: string }`; `Category` union에 `"was" | "db"` 추가; `FRAMEWORKS`에 `{ id:"cis", name:"CIS Benchmark" }`.

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/catalog/index.test.ts`에 추가:

```ts
import { getCatalog, getFrameworks } from ".";

it("every catalog item carries a source with framework + ref", () => {
  for (const item of getCatalog()) {
    expect(item.source, item.id).toBeDefined();
    expect(item.source.framework.length).toBeGreaterThan(0);
    expect(item.source.ref.length).toBeGreaterThan(0);
  }
});

it("registers KISA and CIS frameworks", () => {
  const ids = getFrameworks().map((f) => f.id);
  expect(ids).toContain("kisa");
  expect(ids).toContain("cis");
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/catalog/index.test.ts`. Expected: FAIL (`source` undefined, cis 없음).

- [ ] **Step 3: 타입 확장** — `src/lib/catalog/types.ts`:
  - `export type Category = "container" | "unix" | "web" | "was" | "db";`
  - `CatalogItem`에 `source: { framework: string; ref: string };` 추가.
  - `CATEGORY_LABELS`에 `was: "WAS (CIS 기반)", db: "DB (CIS 기반)"` 추가.

- [ ] **Step 4: CIS 등록** — `src/lib/catalog/frameworks.ts`:

```ts
export const FRAMEWORKS: Framework[] = [
  { id: "kisa", name: "KISA 주요정보통신기반시설 가이드" },
  { id: "cis", name: "CIS Benchmark" },
];
```

- [ ] **Step 5: JSON에 source 추가** — 세 데이터 파일의 각 항목에 `"source"` 키를 추가한다. 프레임워크는 전부 KISA(현 데이터가 KISA 근거). ref는 항목 코드 기반:
  - `container.json`: 각 항목 `"source": { "framework": "KISA", "ref": "컨테이너 하드닝 <id>" }` (예: `"컨테이너 하드닝 C-01"`).
  - `unix.json`: `"source": { "framework": "KISA", "ref": "Unix 서버 <id>" }`.
  - `web.json`: `"source": { "framework": "KISA", "ref": "웹 서비스 <id>" }`.
  - `<id>`는 각 항목의 기존 `id` 값(C-01, U-16, WEB-04 …)을 그대로 넣는다.

- [ ] **Step 6: 통과 확인** — `npx vitest run src/lib/catalog` → PASS.

- [ ] **Step 7: 게이트 + 커밋**

```bash
git add src/lib/catalog/types.ts src/lib/catalog/frameworks.ts src/lib/catalog/data/kisa/ src/lib/catalog/index.test.ts
git commit -m "feat: 카탈로그 항목에 출처(source) 부여 + CIS 프레임워크 등록 (#vendor-scoped-checks)"
```

---

## Task 2: 카탈로그 필터에 컴플라이언스(프레임워크) 축 추가

**Files:**
- Modify: `src/lib/catalog/filter.ts`
- Test: `src/lib/catalog/filter.test.ts`

**Interfaces:**
- Consumes: `CatalogItem.frameworkId`, `Category`(was/db 포함).
- Produces: `CatalogFilterParams.frameworks?: string[]`; `filterCatalog`가 frameworkId를 AND로 필터; `parseComplianceParam(value): string[]`; `CATEGORY_VALUES`에 was/db 추가.

- [ ] **Step 1: 실패 테스트** — `src/lib/catalog/filter.test.ts`에 추가:

```ts
import { filterCatalog, parseComplianceParam } from "./filter";
import type { CatalogItem } from "./types";

const item = (id: string, frameworkId: string): CatalogItem => ({
  id, category: "web", frameworkId, title: id, severity: "Low",
  automationStatus: "automated", source: { framework: frameworkId, ref: id },
});

it("filters by compliance frameworkId (OR within group, AND with others)", () => {
  const items = [item("A", "kisa"), item("B", "cis")];
  expect(filterCatalog(items, { frameworks: ["kisa"] }).map((i) => i.id)).toEqual(["A"]);
  expect(filterCatalog(items, { frameworks: ["kisa", "cis"] }).map((i) => i.id)).toEqual(["A", "B"]);
  expect(filterCatalog(items, {}).map((i) => i.id)).toEqual(["A", "B"]);
});

it("parseComplianceParam keeps known framework ids, drops junk", () => {
  expect(parseComplianceParam(["kisa", "cis", "bogus"])).toEqual(["kisa", "cis"]);
  expect(parseComplianceParam(undefined)).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/catalog/filter.test.ts`. Expected: FAIL.

- [ ] **Step 3: 구현** — `src/lib/catalog/filter.ts`:
  - `CATEGORY_VALUES`에 `"was", "db"` 추가.
  - `CatalogFilterParams`에 `frameworks?: string[];` 추가.
  - `filterCatalog`에 분기 추가(카테고리 필터 바로 다음):
    ```ts
    if (filter.frameworks && filter.frameworks.length > 0 && !filter.frameworks.includes(item.frameworkId)) {
      return false;
    }
    ```
  - 신규 export:
    ```ts
    import { FRAMEWORKS } from "./frameworks";
    const FRAMEWORK_IDS = FRAMEWORKS.map((f) => f.id);
    export function parseComplianceParam(value: string | string[] | undefined): string[] {
      const raw = Array.isArray(value) ? value : value ? [value] : [];
      return Array.from(new Set(raw.filter((v) => FRAMEWORK_IDS.includes(v))));
    }
    ```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/catalog/filter.test.ts` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
git add src/lib/catalog/filter.ts src/lib/catalog/filter.test.ts
git commit -m "feat: 카탈로그 필터에 컴플라이언스(프레임워크) 축 추가 (#vendor-scoped-checks)"
```

---

## Task 3: 카탈로그 화면 — category 파라미터 정리 + 컴플라이언스 필터 UI + 출처 배지

**Files:**
- Modify: `src/app/catalog/page.tsx`
- Modify: `src/app/catalog/FilterPanel.tsx`

**Interfaces:**
- Consumes: `parseCategoryParam`, `parseComplianceParam`, `filterCatalog({categories, frameworks, mode, query})`, `getFrameworks()`.
- 참고: 이 태스크는 UI라 자동 테스트 대신 수동 검증(Step 5) + `tsc`로 게이트한다.

- [ ] **Step 1: 파라미터 파싱 정리** — `page.tsx` searchParams 타입/파싱을 category+compliance로 분리:

```ts
searchParams: Promise<{
  category?: string | string[]; compliance?: string | string[];
  mode?: string | string[]; q?: string;
}>;
```
```ts
const { category, compliance, mode: modeParam, q } = await searchParams;
const selectedCategories = parseCategoryParam(category);
const selectedFrameworks = parseComplianceParam(compliance);
```
그리고 `import { ..., parseComplianceParam } from "@/lib/catalog/filter";`.

- [ ] **Step 2: 필터 적용에 frameworks 전달** — `page.tsx`의 루프:

```ts
const items = filterCatalog(getCatalogByCategory(category), {
  frameworks: selectedFrameworks, mode: selectedMode, query,
});
```

- [ ] **Step 3: 출처 배지 열 추가** — `page.tsx` 테이블의 "프레임워크" 셀을 항목의 `source`로 표기:

```tsx
<td className="px-5 py-3 text-muted">
  {item.source.framework} · <span className="font-mono text-[12px]">{item.source.ref}</span>
</td>
```

- [ ] **Step 4: FilterPanel 갱신** — `FilterPanel.tsx`:
  - `buildHref`에서 category param 이름을 `framework`→`category`로 바꾸고 compliance를 함께 유지:
    ```ts
    function buildHref(p: { categories: Category[]; frameworks: string[]; mode?: ModeFilter; query: string }): string {
      const s = new URLSearchParams();
      for (const c of p.categories) s.append("category", c);
      for (const f of p.frameworks) s.append("compliance", f);
      if (p.mode) s.set("mode", p.mode);
      if (p.query) s.set("q", p.query);
      const qs = s.toString();
      return qs ? `/catalog?${qs}` : "/catalog";
    }
    ```
  - props에 `selectedFrameworks: string[]`, `frameworks: { id: string; name: string }[]` 추가.
  - 기존 두 카드의 모든 `buildHref(...)` 호출에 `frameworks: selectedFrameworks`를 추가하고, category 카드 호출은 `categories: ...` 유지.
  - "컴플라이언스" 카드를 "점검 방식" 카드 위에 추가(카테고리 카드와 동일 패턴, 전체 토글 + 각 framework 다중선택):
    ```tsx
    <Card title="컴플라이언스" bodyClassName="p-2">
      <ul className="flex flex-col gap-1">
        <li>
          <Link href={buildHref({ categories: selectedCategories, frameworks: [], mode: selectedMode, query })}
            aria-pressed={selectedFrameworks.length === 0}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg">
            <CheckboxMark checked={selectedFrameworks.length === 0} /><span className="flex-1">전체</span>
          </Link>
        </li>
        {frameworks.map((fw) => {
          const checked = selectedFrameworks.includes(fw.id);
          const next = checked ? selectedFrameworks.filter((x) => x !== fw.id) : [...selectedFrameworks, fw.id];
          return (
            <li key={fw.id}>
              <Link href={buildHref({ categories: selectedCategories, frameworks: next, mode: selectedMode, query })}
                aria-pressed={checked}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg">
                <CheckboxMark checked={checked} /><span className="flex-1">{fw.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
    ```
  - `page.tsx`에서 `<FilterPanel ... selectedFrameworks={selectedFrameworks} frameworks={frameworks} />` 전달.

- [ ] **Step 5: 수동 검증** — `npm run dev` 후 `/catalog`:
  - 컴플라이언스 카드에서 KISA만/CIS만 토글 시 결과가 걸러진다(현재 데이터는 KISA뿐이라 CIS 선택 시 0건, KISA 선택 시 전체).
  - URL이 `?category=web&compliance=kisa`처럼 반영되고 새로고침해도 유지된다.
  - 각 항목 행에 `KISA · 웹 서비스 WEB-04` 형태 출처가 보인다.

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/app/catalog/page.tsx src/app/catalog/FilterPanel.tsx
git add src/app/catalog/page.tsx src/app/catalog/FilterPanel.tsx
git commit -m "feat: 카탈로그 컴플라이언스 필터 + 출처 배지, category 파라미터 정리 (#vendor-scoped-checks)"
```

---

## Task 4: 팩 인터페이스 정의

**Files:**
- Create: `src/lib/packs/types.ts`
- Test: `src/lib/packs/types.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PlaybookTask { name: string; raw: string; }
  export interface EvalContext { findings: DockerfileFindings | null; tasks: AnsibleTaskOutput[]; }
  export interface VendorPack {
    id: string;
    category: "OS" | "WEB" | "WAS" | "DB" | "container";
    vendors: string[];                 // 베이스라인 팩은 []
    executionPath: "linux" | "windows";
    itemIds: string[];                 // 이 팩이 판정하는 카탈로그 항목 id
    evidenceTasks: PlaybookTask[];     // 벤더 전용 증거(베이스라인 팩은 [])
    detect(tasks: AnsibleTaskOutput[]): boolean;
    evaluate(ctx: EvalContext): CheckResult[];
  }
  export interface CheckPlan { packs: VendorPack[]; evidenceTasks: PlaybookTask[]; }
  ```

- [ ] **Step 1: 파일 작성** — `src/lib/packs/types.ts`:

```ts
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { DockerfileFindings } from "@/lib/checks/dockerfileChecks";
import type { CheckResult } from "@/lib/checks/types";

// 하나의 ansible raw 태스크. name은 플레이북 내 유일해야 하며,
// ruleEvaluation의 findTaskOutput이 `<id>:` 프리픽스로 매칭하는 그 이름이다.
export interface PlaybookTask {
  name: string;
  raw: string;
}

export interface EvalContext {
  findings: DockerfileFindings | null;
  tasks: AnsibleTaskOutput[];
}

// 한 점검군(벤더 또는 베이스라인)을 자기 완결적으로 표현한다.
export interface VendorPack {
  id: string;
  category: "OS" | "WEB" | "WAS" | "DB" | "container";
  vendors: string[];
  executionPath: "linux" | "windows";
  itemIds: string[];
  evidenceTasks: PlaybookTask[];
  detect(tasks: AnsibleTaskOutput[]): boolean;
  evaluate(ctx: EvalContext): CheckResult[];
}

export interface CheckPlan {
  packs: VendorPack[];
  evidenceTasks: PlaybookTask[];
}
```

- [ ] **Step 2: 타입 컴파일 테스트** — `src/lib/packs/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { VendorPack } from "./types";

describe("VendorPack shape", () => {
  it("constructs a minimal pack", () => {
    const p: VendorPack = {
      id: "x", category: "OS", vendors: [], executionPath: "linux",
      itemIds: [], evidenceTasks: [], detect: () => true, evaluate: () => [],
    };
    expect(p.id).toBe("x");
  });
});
```

- [ ] **Step 3: 통과 + 게이트 + 커밋**

```bash
npx vitest run src/lib/packs/types.test.ts && npx tsc --noEmit
git add src/lib/packs/types.ts src/lib/packs/types.test.ts
git commit -m "feat: 벤더 팩 인터페이스 정의 (#vendor-scoped-checks)"
```

---

## Task 5: 증거 태스크 병합 + 합성 플레이북 생성

**Files:**
- Create: `src/lib/packs/playbook.ts`
- Test: `src/lib/packs/playbook.test.ts`

**Interfaces:**
- Consumes: `PlaybookTask`.
- Produces:
  - `mergeEvidenceTasks(taskLists: PlaybookTask[][]): PlaybookTask[]` — name 기준 dedupe. 같은 name·다른 raw면 `throw new Error("evidence task 충돌: <name>")`.
  - `renderTasksYaml(tasks: PlaybookTask[]): string` — 태스크 배열을 ansible task YAML 조각으로 렌더(들여쓰기 4칸, `ansible.builtin.raw` + `changed_when: false`).

- [ ] **Step 1: 실패 테스트** — `src/lib/packs/playbook.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeEvidenceTasks, renderTasksYaml } from "./playbook";

describe("mergeEvidenceTasks", () => {
  it("dedupes identical tasks by name", () => {
    const a = [{ name: "T1", raw: "echo 1" }];
    const b = [{ name: "T1", raw: "echo 1" }, { name: "T2", raw: "echo 2" }];
    expect(mergeEvidenceTasks([a, b]).map((t) => t.name)).toEqual(["T1", "T2"]);
  });
  it("throws on same name with different command", () => {
    const a = [{ name: "T1", raw: "echo 1" }];
    const b = [{ name: "T1", raw: "echo X" }];
    expect(() => mergeEvidenceTasks([a, b])).toThrow(/충돌: T1/);
  });
});

describe("renderTasksYaml", () => {
  it("renders a raw task block with changed_when false", () => {
    const yaml = renderTasksYaml([{ name: 'WEB-99: x', raw: "echo hi" }]);
    expect(yaml).toContain('- name: "WEB-99: x"');
    expect(yaml).toContain("ansible.builtin.raw:");
    expect(yaml).toContain("changed_when: false");
    expect(yaml).toContain("echo hi");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/packs/playbook.test.ts`. Expected: FAIL.

- [ ] **Step 3: 구현** — `src/lib/packs/playbook.ts`:

```ts
import type { PlaybookTask } from "./types";

// 여러 팩의 evidenceTasks를 name 기준으로 dedupe·병합한다. 같은 name에
// 다른 command가 등록되면 개발 시점에 드러나도록 예외로 조기 실패한다.
export function mergeEvidenceTasks(taskLists: PlaybookTask[][]): PlaybookTask[] {
  const byName = new Map<string, PlaybookTask>();
  for (const list of taskLists) {
    for (const task of list) {
      const existing = byName.get(task.name);
      if (existing) {
        if (existing.raw !== task.raw) throw new Error(`evidence task 충돌: ${task.name}`);
        continue;
      }
      byName.set(task.name, task);
    }
  }
  return [...byName.values()];
}

// PlaybookTask[]를 security-checks.yml에 append 가능한 task YAML 조각으로
// 렌더한다. raw 커맨드는 YAML block scalar(|)로 넣어 따옴표/특수문자를
// 이스케이프 없이 안전하게 담는다.
export function renderTasksYaml(tasks: PlaybookTask[]): string {
  return tasks
    .map((task) => {
      const indentedCmd = task.raw
        .split("\n")
        .map((line) => `          ${line}`)
        .join("\n");
      return [
        `    - name: ${JSON.stringify(task.name)}`,
        `      ansible.builtin.raw: |`,
        indentedCmd,
        `      changed_when: false`,
      ].join("\n");
    })
    .join("\n");
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/packs/playbook.test.ts` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/playbook.ts src/lib/packs/playbook.test.ts
git commit -m "feat: 증거 태스크 병합 + 합성 플레이북 렌더 (#vendor-scoped-checks)"
```

---

## Task 6: 베이스라인 팩(os-unix, container)

**Files:**
- Create: `src/lib/packs/osUnix.ts`, `src/lib/packs/container.ts`
- Test: `src/lib/packs/baselinePacks.test.ts`

**Interfaces:**
- Consumes: `ruleEvaluation`의 기존 export(`evaluateU01..U67`, `evaluateC01..C09`), `getCatalogByCategory`.
- Produces: `osUnixPack: VendorPack`(category `OS`, vendors `[]`, itemIds = unix 카탈로그 id들), `containerPack: VendorPack`(category `container`).
- 참고: 베이스라인 팩은 `evidenceTasks: []`(C-*/U-* 증거는 base 플레이북에 그대로 있음), `detect: () => true`(항상 적용).

- [ ] **Step 1: 실패 테스트** — `src/lib/packs/baselinePacks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { getCatalogByCategory } from "@/lib/catalog";

describe("baseline packs", () => {
  it("osUnix covers exactly the unix catalog ids and no evidence tasks", () => {
    const unixIds = getCatalogByCategory("unix").map((i) => i.id).sort();
    expect(osUnixPack.itemIds.slice().sort()).toEqual(unixIds);
    expect(osUnixPack.evidenceTasks).toEqual([]);
    expect(osUnixPack.detect([])).toBe(true);
  });
  it("container covers exactly the container catalog ids", () => {
    const cIds = getCatalogByCategory("container").map((i) => i.id).sort();
    expect(containerPack.itemIds.slice().sort()).toEqual(cIds);
  });
  it("osUnix.evaluate returns one result per unix item", () => {
    const results = osUnixPack.evaluate({ findings: null, tasks: [] });
    expect(results.map((r) => r.id).sort()).toEqual(osUnixPack.itemIds.slice().sort());
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/packs/baselinePacks.test.ts`. Expected: FAIL.

- [ ] **Step 3: osUnix 구현** — `src/lib/packs/osUnix.ts`. `ruleEvaluation`의 U-* 평가기를 조합한다(항목 순서는 `evaluateAllChecks`의 U-* 순서와 동일하게):

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import * as R from "@/lib/checks/ruleEvaluation";
import type { EvalContext, VendorPack } from "./types";
import type { CheckResult } from "@/lib/checks/types";

// U-01..U-67 평가기를 evaluateAllChecks와 동일 순서로 나열한다. 각 평가기는
// tasks만 사용(U-*는 Dockerfile findings 불필요)한다.
function evaluateUnix(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    R.evaluateU01(t), R.evaluateU02(t), R.evaluateU03(t), R.evaluateU04(t), R.evaluateU05(t),
    R.evaluateU06(t), R.evaluateU07(t), R.evaluateU08(t), R.evaluateU09(t), R.evaluateU10(t),
    R.evaluateU11(t), R.evaluateU12(t), R.evaluateU13(t), R.evaluateU16(t), R.evaluateU14(t),
    R.evaluateU15(t), R.evaluateU17(t), R.evaluateU18(t), R.evaluateU19(t), R.evaluateU20(t),
    R.evaluateU21(t), R.evaluateU22(t), R.evaluateU23(t), R.evaluateU24(t), R.evaluateU25(t),
    R.evaluateU26(t), R.evaluateU27(t), R.evaluateU28(t), R.evaluateU29(t), R.evaluateU30(t),
    R.evaluateU31(t), R.evaluateU32(t), R.evaluateU33(t), R.evaluateU34(t), R.evaluateU35(t),
    R.evaluateU36(t), R.evaluateU37(t), R.evaluateU38(t), R.evaluateU39(t), R.evaluateU40(t),
    R.evaluateU41(t), R.evaluateU42(t), R.evaluateU43(t), R.evaluateU44(t), R.evaluateU45(t),
    R.evaluateU46(t), R.evaluateU47(t), R.evaluateU48(t), R.evaluateU49(t), R.evaluateU50(t),
    R.evaluateU51(t), R.evaluateU52(t), R.evaluateU53(t), R.evaluateU54(t), R.evaluateU55(t),
    R.evaluateU56(t), R.evaluateU57(t), R.evaluateU58(t), R.evaluateU59(t), R.evaluateU60(t),
    R.evaluateU61(t), R.evaluateU62(t), R.evaluateU63(t), R.evaluateU64(t), R.evaluateU65(t),
    R.evaluateU66(t), R.evaluateU67(t),
  ];
}

export const osUnixPack: VendorPack = {
  id: "os-unix",
  category: "OS",
  vendors: [],
  executionPath: "linux",
  itemIds: getCatalogByCategory("unix").map((i) => i.id),
  evidenceTasks: [],
  detect: () => true,
  evaluate: evaluateUnix,
};
```

- [ ] **Step 4: container 구현** — `src/lib/packs/container.ts`:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import * as R from "@/lib/checks/ruleEvaluation";
import type { EvalContext, VendorPack } from "./types";
import type { CheckResult } from "@/lib/checks/types";

// C-01..C-09 평가기를 evaluateAllChecks와 동일 순서로. C-*는 Dockerfile
// findings를 쓰는 항목이 있어 ctx.findings를 넘긴다.
function evaluateContainer(ctx: EvalContext): CheckResult[] {
  const { findings, tasks } = ctx;
  return [
    R.evaluateC01(findings, tasks), R.evaluateC02(findings), R.evaluateC03(findings, tasks),
    R.evaluateC04(findings), R.evaluateC05(tasks), R.evaluateC06(tasks), R.evaluateC07(tasks),
    R.evaluateC08(findings), R.evaluateC09(findings),
  ];
}

export const containerPack: VendorPack = {
  id: "container",
  category: "container",
  vendors: [],
  executionPath: "linux",
  itemIds: getCatalogByCategory("container").map((i) => i.id),
  evidenceTasks: [],
  detect: () => true,
  evaluate: evaluateContainer,
};
```

- [ ] **Step 5: 통과 확인** — `npx vitest run src/lib/packs/baselinePacks.test.ts` → PASS. (실패 시 `evaluateAllChecks`의 C-*/U-* 실제 순서·인자와 대조해 맞춘다.)

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/osUnix.ts src/lib/packs/container.ts src/lib/packs/baselinePacks.test.ts
git commit -m "feat: 베이스라인 팩(os-unix, container) (#vendor-scoped-checks)"
```

---

## Task 7: web-nginx 팩 (nginx 증거 태스크 이관 + WEB 평가 + detect)

**Files:**
- Create: `src/lib/packs/webNginx.ts`
- Modify: `ansible/security-checks.yml` (nginx 태스크 제거)
- Test: `src/lib/packs/webNginx.test.ts`
- Test(회귀): `src/lib/checks/ruleEvaluation.test.ts` (수정 없이 통과 확인)

**Interfaces:**
- Consumes: `ruleEvaluation`의 `evaluateWEB01..WEB26`, `getNginxState`(nginx 탐지). `getNginxState`가 export되어 있지 않으면 export로 승격.
- Produces: `webNginxPack: VendorPack`(category `WEB`, vendors `["Nginx"]`, itemIds = web 카탈로그 id들, evidenceTasks = 이관한 nginx 태스크들, detect = nginx 존재).

- [ ] **Step 1: getNginxState export 확인** — `src/lib/checks/ruleEvaluation.ts`에서 `getNginxState`가 `export`인지 확인, 아니면 `export function getNginxState(...)`로 승격(시그니처 불변).

- [ ] **Step 2: 실패 테스트** — `src/lib/packs/webNginx.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { webNginxPack } from "./webNginx";
import { getCatalogByCategory } from "@/lib/catalog";

const nginxPresent = [{ taskName: "nginx detection (internal)", stdout: "present" }];

describe("webNginxPack", () => {
  it("owns the web catalog ids and the nginx evidence tasks", () => {
    const webIds = getCatalogByCategory("web").map((i) => i.id).sort();
    expect(webNginxPack.itemIds.slice().sort()).toEqual(webIds);
    expect(webNginxPack.vendors).toEqual(["Nginx"]);
    const names = webNginxPack.evidenceTasks.map((t) => t.name);
    expect(names).toContain("nginx detection (internal)");
    expect(names).toContain("nginx effective config (internal)");
  });
  it("detects nginx from evidence", () => {
    expect(webNginxPack.detect(nginxPresent)).toBe(true);
    expect(webNginxPack.detect([])).toBe(false);
  });
  it("evaluate returns one result per web item", () => {
    const results = webNginxPack.evaluate({ findings: null, tasks: nginxPresent });
    expect(results.map((r) => r.id).sort()).toEqual(webNginxPack.itemIds.slice().sort());
  });
});
```

- [ ] **Step 3: 실패 확인** — `npx vitest run src/lib/packs/webNginx.test.ts`. Expected: FAIL.

- [ ] **Step 4: webNginx 구현** — `src/lib/packs/webNginx.ts`. `evidenceTasks`는 `ansible/security-checks.yml`의 nginx 관련 태스크(현재 줄 583–648: `nginx detection (internal)`, `nginx effective config (internal)`, `nginx version (internal)`, `WEB-03: ...`, `WEB-26: ...`, `nginx document root scan (internal)`)를 **각 `name:`/`raw:` 본문 그대로** `PlaybookTask`로 옮긴다:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import * as R from "@/lib/checks/ruleEvaluation";
import { getNginxState } from "@/lib/checks/ruleEvaluation";
import type { EvalContext, PlaybookTask, VendorPack } from "./types";
import type { CheckResult } from "@/lib/checks/types";

// security-checks.yml에서 이관한 nginx 전용 증거 수집 태스크. name은 기존과
// 동일해야 evaluateWEB* 의 findTaskOutput/getNginxState 매칭이 유지된다.
const NGINX_EVIDENCE: PlaybookTask[] = [
  { name: "nginx detection (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1 && [ -e /etc/nginx/nginx.conf ]; then echo present; else echo absent; fi; true'` },
  { name: "nginx effective config (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then nginx -T 2>&1; else echo __MISSING__; fi; true'` },
  { name: "nginx version (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then nginx -v 2>&1; else echo __MISSING__; fi; true'` },
  { name: "WEB-03: nginx basic auth password file permissions",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then LINE=$(nginx -T 2>/dev/null | grep -m1 "auth_basic_user_file"); F=$(echo "$LINE" | tr -s " " | cut -d" " -f2 | tr -d ";"); if [ -n "$F" ] && [ -e "$F" ]; then stat -c "%U:%G %a" "$F"; else echo __MISSING__; fi; else echo __MISSING__; fi; true'` },
  { name: "WEB-26: nginx log directory permissions",
    raw: `sh -c 'if [ -d /var/log/nginx ]; then stat -c "%U:%G %a" /var/log/nginx; else echo __MISSING__; fi; true'` },
  { name: "nginx document root scan (internal)",
    raw: `sh -c 'if command -v nginx >/dev/null 2>&1; then ROOTS=$(nginx -T 2>/dev/null | grep -E "^[[:space:]]*(root|alias)[[:space:]]" | awk "{print \\$2}" | tr -d ";" | sort -u); if [ -z "$ROOTS" ]; then echo __MISSING__; else for r in $ROOTS; do if [ -d "$r" ]; then find "$r" -maxdepth 3 \\( -iname "phpinfo.php" -o -iname "install.php" -o -iname "readme*" -o -iname "changelog*" -o -iname "license*" -o -iname ".git" -o -iname ".svn" -o -iname ".env" \\) 2>/dev/null | sed "s/^/LEFTOVER:/"; find "$r" -maxdepth 5 -type f -perm -0002 2>/dev/null | sed "s/^/WRITABLE:/"; fi; done; fi; else echo __MISSING__; fi; true'` },
];

function evaluateWeb(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    R.evaluateWEB01(t), R.evaluateWEB02(t), R.evaluateWEB03(t), R.evaluateWEB04(t), R.evaluateWEB05(t),
    R.evaluateWEB06(t), R.evaluateWEB07(t), R.evaluateWEB08(t), R.evaluateWEB09(t), R.evaluateWEB10(t),
    R.evaluateWEB11(t), R.evaluateWEB12(t), R.evaluateWEB13(t), R.evaluateWEB14(t), R.evaluateWEB15(t),
    R.evaluateWEB16(t), R.evaluateWEB17(t), R.evaluateWEB18(t), R.evaluateWEB19(t), R.evaluateWEB20(t),
    R.evaluateWEB21(t), R.evaluateWEB22(t), R.evaluateWEB23(t), R.evaluateWEB24(t), R.evaluateWEB25(t),
    R.evaluateWEB26(t),
  ];
}

export const webNginxPack: VendorPack = {
  id: "web-nginx",
  category: "WEB",
  vendors: ["Nginx"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("web").map((i) => i.id),
  evidenceTasks: NGINX_EVIDENCE,
  detect: (tasks) => getNginxState(tasks).present,
  evaluate: evaluateWeb,
};
```

  주의: 위 `raw` 문자열은 YAML 원문을 한 줄로 옮긴 것이다. 옮길 때 `security-checks.yml`의 각 태스크 본문과 **문자 단위로 대조**하고, 백슬래시(`\(`, `\$`)는 TS 문자열에서 `\\(`, `\\$`로 이스케이프한다.

- [ ] **Step 5: base 플레이북에서 nginx 태스크 제거** — `ansible/security-checks.yml`에서 Step 4로 옮긴 6개 태스크(줄 583–648 영역, `# WEB-01..WEB-26 ...` 주석 블록 포함)를 삭제한다. C-*/U-* 태스크는 그대로 둔다.

- [ ] **Step 6: 통과 확인 + 회귀** —
  - `npx vitest run src/lib/packs/webNginx.test.ts` → PASS.
  - `npx vitest run src/lib/checks/ruleEvaluation.test.ts` → PASS(평가기는 불변이므로 그대로 통과해야 함).

- [ ] **Step 7: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/webNginx.ts src/lib/packs/webNginx.test.ts ansible/security-checks.yml src/lib/checks/ruleEvaluation.ts
git commit -m "feat: web-nginx 팩 + base 플레이북에서 nginx 증거 분리 (#vendor-scoped-checks)"
```

---

## Task 8: 레지스트리 + resolveCheckPlan + evaluatePlan

**Files:**
- Create: `src/lib/packs/registry.ts`, `src/lib/packs/resolve.ts`
- Test: `src/lib/packs/registry.test.ts`, `src/lib/packs/resolve.test.ts`

**Interfaces:**
- Consumes: `osUnixPack`, `containerPack`, `webNginxPack`, `Asset`(`sourceType`? — 아래 주의), `mergeEvidenceTasks`.
- Produces:
  - `ALL_PACKS: VendorPack[]`; `findVendorPack(category, vendor): VendorPack | undefined`.
  - `resolveCheckPlan(asset: Asset): CheckPlan`.
  - `evaluatePack(pack: VendorPack, ctx: EvalContext): CheckResult[]` — 실행경로 windows→전부 review; 벤더팩(`vendors.length>0`)이고 `!detect`→전부 review; 그 외 `pack.evaluate`.
  - `evaluatePlan(plan: CheckPlan, ctx: EvalContext): CheckResult[]` — 각 팩 evaluatePack 결과를 concat.
- 주의: `Asset`에는 `sourceType`이 없다. 자산 종류는 `asset.type`(`"server" | "repo"`)로 구분한다(`listAssets({type})`에서 확인). 베이스라인: `type==="server"`→osUnix, 그 외→container.

- [ ] **Step 1: registry 실패 테스트** — `src/lib/packs/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findVendorPack, ALL_PACKS } from "./registry";

describe("registry", () => {
  it("finds the nginx pack by WEB/Nginx (case-insensitive vendor)", () => {
    expect(findVendorPack("WEB", "Nginx")?.id).toBe("web-nginx");
    expect(findVendorPack("WEB", "nginx")?.id).toBe("web-nginx");
  });
  it("returns undefined for an unregistered vendor", () => {
    expect(findVendorPack("DB", "Oracle")).toBeUndefined();
  });
  it("registers only baseline + web-nginx in this cycle", () => {
    expect(ALL_PACKS.map((p) => p.id).sort()).toEqual(["container", "os-unix", "web-nginx"]);
  });
});
```

- [ ] **Step 2: registry 구현** — `src/lib/packs/registry.ts`:

```ts
import type { VendorPack } from "./types";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { webNginxPack } from "./webNginx";

// 이번 사이클(#0+#1 이전)에 등록된 팩. #1(Apache)~#4는 여기에 팩을 추가만 한다.
export const ALL_PACKS: VendorPack[] = [osUnixPack, containerPack, webNginxPack];

// 애플리케이션 벤더 팩(vendors 비어있지 않음)만 대상으로, category와 vendor로
// 팩을 찾는다. vendor는 대소문자 무시.
export function findVendorPack(category: string, vendor: string): VendorPack | undefined {
  const v = vendor.trim().toLowerCase();
  return ALL_PACKS.find(
    (p) => p.category === category && p.vendors.some((pv) => pv.toLowerCase() === v),
  );
}
```

- [ ] **Step 3: 통과 확인** — `npx vitest run src/lib/packs/registry.test.ts` → PASS.

- [ ] **Step 4: resolve 실패 테스트** — `src/lib/packs/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveCheckPlan, evaluatePack } from "./resolve";
import type { Asset } from "@/lib/assets/types";
import type { VendorPack } from "./types";

const base = {
  id: "a1", displayName: "x", projectId: null, os: null, owner: null,
  category: null, vendor: null, createdAt: "", encryptedSecret: null,
} as unknown as Asset;

describe("resolveCheckPlan", () => {
  it("server + WEB/Nginx → os-unix + web-nginx, nginx evidence included", () => {
    const asset = { ...base, type: "server", category: "WEB", vendor: "Nginx" } as Asset;
    const plan = resolveCheckPlan(asset);
    expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "web-nginx"]);
    expect(plan.evidenceTasks.some((t) => t.name === "nginx detection (internal)")).toBe(true);
  });
  it("server + OS/Ubuntu → os-unix only", () => {
    const asset = { ...base, type: "server", category: "OS", vendor: "Ubuntu" } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-unix"]);
  });
  it("repo asset → container baseline", () => {
    const asset = { ...base, type: "repo", category: null, vendor: null } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["container"]);
  });
});

describe("evaluatePack review rules", () => {
  const fakeVendorPack: VendorPack = {
    id: "web-x", category: "WEB", vendors: ["Xserver"], executionPath: "linux",
    itemIds: ["WEB-01", "WEB-02"], evidenceTasks: [],
    detect: () => false, evaluate: () => [{ id: "WEB-01", status: "pass", evidence: "" }],
  };
  it("declared-but-undetected vendor pack → every item review", () => {
    const results = evaluatePack(fakeVendorPack, { findings: null, tasks: [] });
    expect(results.map((r) => r.status)).toEqual(["review", "review"]);
    expect(results[0].evidence).toMatch(/Xserver 미확인/);
  });
  it("windows pack → every item review (host pending)", () => {
    const win = { ...fakeVendorPack, executionPath: "windows" as const, detect: () => true };
    const results = evaluatePack(win, { findings: null, tasks: [] });
    expect(results.every((r) => r.status === "review")).toBe(true);
    expect(results[0].evidence).toMatch(/Windows 호스트 연결 대기/);
  });
});
```

- [ ] **Step 5: 실패 확인** — `npx vitest run src/lib/packs/resolve.test.ts`. Expected: FAIL.

- [ ] **Step 6: resolve 구현** — `src/lib/packs/resolve.ts`:

```ts
import type { Asset } from "@/lib/assets/types";
import type { CheckResult } from "@/lib/checks/types";
import type { CheckPlan, EvalContext, VendorPack } from "./types";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { findVendorPack } from "./registry";
import { mergeEvidenceTasks } from "./playbook";

// 미지원 벤더(선택된 category에 매칭 팩 없음)를 알리는 합성 항목 id.
const UNSUPPORTED_VENDOR_ID = "VENDOR-NA";

// 자산의 종류로 베이스라인을, category+vendor로 벤더 팩을 골라 합성한다.
export function resolveCheckPlan(asset: Asset): CheckPlan {
  const packs: VendorPack[] = [];
  packs.push(asset.type === "server" ? osUnixPack : containerPack);

  // OS 카테고리는 베이스라인만(별도 벤더 팩 없음). WEB/WAS/DB만 벤더 팩을 더한다.
  if (asset.category && asset.category !== "OS" && asset.vendor) {
    const vp = findVendorPack(asset.category, asset.vendor);
    if (vp) packs.push(vp);
  }

  const evidenceTasks = mergeEvidenceTasks(packs.map((p) => p.evidenceTasks));
  return { packs, evidenceTasks };
}

function reviewAll(pack: VendorPack, message: string): CheckResult[] {
  return pack.itemIds.map((id) => ({ id, status: "review", evidence: message }));
}

// 팩 하나를 평가하되 선택-모델 규칙을 적용한다:
// - windows 실행경로: 실제 연결 전이므로 전부 review.
// - 벤더 팩인데 호스트에서 미탐지: skip이 아니라 전부 review(인벤토리 불일치 노출).
// - 그 외: 팩의 실제 평가.
export function evaluatePack(pack: VendorPack, ctx: EvalContext): CheckResult[] {
  if (pack.executionPath === "windows") {
    return reviewAll(pack, "Windows 호스트 연결 대기 (자동 점검 미연결)");
  }
  if (pack.vendors.length > 0 && !pack.detect(ctx.tasks)) {
    return reviewAll(pack, `선언된 ${pack.vendors.join("/")} 미확인 — 인벤토리 확인 필요`);
  }
  return pack.evaluate(ctx);
}

// 애플리케이션 자산인데 category에 매칭되는 벤더 팩이 없을 때, 침묵 대신
// 미지원 사실을 review 1건으로 남긴다. resolveCheckPlan에서 벤더 팩을 못 찾은
// 경우를 evaluatePlan이 알 수 있도록 asset을 함께 받는다.
export function evaluatePlan(plan: CheckPlan, ctx: EvalContext, asset: Asset): CheckResult[] {
  const results = plan.packs.flatMap((pack) => evaluatePack(pack, ctx));
  const hasVendorPack = plan.packs.some((p) => p.vendors.length > 0);
  if (asset.category && asset.category !== "OS" && asset.vendor && !hasVendorPack) {
    results.push({
      id: UNSUPPORTED_VENDOR_ID,
      status: "review",
      evidence: `미지원 벤더 (${asset.category}/${asset.vendor}) — 자동 점검 미구현`,
    });
  }
  return results;
}
```

- [ ] **Step 7: 통과 확인** — `npx vitest run src/lib/packs/resolve.test.ts` → PASS.

- [ ] **Step 8: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/registry.ts src/lib/packs/resolve.ts src/lib/packs/registry.test.ts src/lib/packs/resolve.test.ts
git commit -m "feat: 팩 레지스트리 + resolveCheckPlan + evaluatePlan (선택 모델 규칙) (#vendor-scoped-checks)"
```

---

## Task 9: 파이프라인 배선 — 합성 플레이북 실행 + evaluatePlan 전환

**Files:**
- Modify: `src/lib/checks/ansibleRunner.ts`
- Modify: `src/lib/checks/index.ts` (`runAllChecks`)
- Modify: `src/lib/pipeline/orchestrator.ts`, `src/lib/pipeline/serverScan.ts`
- Test: `src/lib/checks/ansibleRunner.test.ts`(회귀), `src/lib/pipeline/serverScan.test.ts`(회귀), `src/lib/pipeline/orchestrator.test.ts`(회귀)

**Interfaces:**
- Consumes: `resolveCheckPlan`, `evaluatePlan`, `renderTasksYaml`, `getAsset`.
- Produces:
  - `runAnsibleChecks(containerName, extraTasks?: PlaybookTask[])` / `runAnsibleForServer(asset, extraTasks?, timeoutMs?)` — 벤더 증거 태스크를 base 플레이북에 append해 실행. `extraTasks` 미지정 시 기존과 동일(base만).
  - `runAllChecks(dockerfilePath, containerName, asset?)` — asset이 있으면 `resolveCheckPlan`으로 evidence/plan을 만들고 `evaluatePlan`으로 평가. asset이 없으면(로컬 이미지 등 하위호환) 기존 `evaluateAllChecks` 경로 유지.

- [ ] **Step 1: 합성 플레이북 실행 헬퍼** — `ansibleRunner.ts`에 base+extra를 임시 파일로 쓰는 헬퍼 추가. `renderTasksYaml`로 렌더한 조각을 base 플레이북 텍스트 뒤에 붙여 임시 파일로 저장 후 그 경로로 실행:

```ts
import fs from "fs";
import os from "os";
import { renderTasksYaml } from "@/lib/packs/playbook";
import type { PlaybookTask } from "@/lib/packs/types";

// base 플레이북(security-checks.yml)에 벤더 증거 태스크를 append한 임시
// 플레이북을 만들어 그 경로를 콜백에 넘긴다. extraTasks가 비면 base 경로를
// 그대로 사용(임시 파일 없음).
async function withComposedPlaybook<T>(
  extraTasks: PlaybookTask[],
  fn: (playbookPath: string) => Promise<T>,
): Promise<T> {
  if (extraTasks.length === 0) return fn(PLAYBOOK_PATH);
  const base = fs.readFileSync(PLAYBOOK_PATH, "utf8");
  const composed = `${base.replace(/\s*$/, "")}\n${renderTasksYaml(extraTasks)}\n`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhg-playbook-"));
  const file = path.join(dir, "checks.yml");
  fs.writeFileSync(file, composed, { mode: 0o600 });
  try {
    return await fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: 두 실행 함수에 extraTasks 배선** — `runAnsibleChecks`/`runAnsibleForServer`가 `extraTasks: PlaybookTask[] = []`를 받아 `withComposedPlaybook`로 감싼다. `runAnsibleChecks`:

```ts
export async function runAnsibleChecks(
  containerName: string,
  extraTasks: PlaybookTask[] = [],
): Promise<AnsibleTaskOutput[]> {
  return withComposedPlaybook(extraTasks, (playbookPath) =>
    execAnsiblePlaybook(
      ["-i", `${containerName},`, "-c", "community.docker.docker", playbookPath],
      60_000,
    ),
  );
}
```
  `runAnsibleForServer`는 내부 `run(keyFilePath)`가 쓰는 `buildSshArgs(...).args`의 마지막 `PLAYBOOK_PATH` 위치를 `withComposedPlaybook`가 준 경로로 대체한다(즉 `withComposedPlaybook`로 전체를 감싸고 `runAnsibleWithArgs`에 playbookPath를 넘김). `runAnsibleWithArgs`/`buildServerRunPlan`이 `PLAYBOOK_PATH` 상수를 직접 참조하던 부분을 인자로 받은 경로로 바꾼다.

- [ ] **Step 3: runAllChecks 재작성** — `src/lib/checks/index.ts`:

```ts
import { analyzeDockerfile } from "./dockerfileChecks";
import { runAnsibleChecks } from "./ansibleRunner";
import { evaluateAllChecks } from "./ruleEvaluation";
import { resolveCheckPlan, evaluatePlan } from "@/lib/packs/resolve";
import type { Asset } from "@/lib/assets/types";
import type { CheckResult } from "./types";

export type { CheckResult } from "./types";

export async function runAllChecks(
  dockerfilePath: string | undefined,
  containerName: string,
  asset?: Asset,
): Promise<CheckResult[]> {
  const findings = dockerfilePath ? analyzeDockerfile(dockerfilePath) : null;

  // asset이 있으면 벤더 팩 계획으로 증거·평가를 스코프한다.
  if (asset) {
    const plan = resolveCheckPlan(asset);
    const tasks = await runAnsibleChecks(containerName, plan.evidenceTasks);
    return evaluatePlan(plan, { findings, tasks }, asset);
  }

  // 하위호환: asset 없이 호출되면(로컬 이미지 재점검 등) 기존 전체 평가.
  const tasks = await runAnsibleChecks(containerName);
  return evaluateAllChecks(findings, tasks);
}
```

- [ ] **Step 4: orchestrator 배선** — `orchestrator.ts`의 `runPipeline`에서 run의 `asset_id`로 자산을 조회해 `runChecks`에 넘긴다. `import { getAsset } from "@/lib/assets/store";` 추가 후, ansible 단계 직전:

```ts
const assetId = (db.prepare(`SELECT asset_id FROM runs WHERE id = ?`).get(runId) as { asset_id: string | null } | undefined)?.asset_id ?? null;
const asset = assetId ? getAsset(assetId, db) : undefined;
...
results = await deps.runChecks(dockerfilePath, containerName, asset ?? undefined);
```
  `PipelineDeps.runChecks` 타입은 `typeof runAllChecks`라 이미 3번째 인자를 허용한다.

- [ ] **Step 5: serverScan 배선** — `serverScan.ts`의 `runServerScanPipeline`에서 `evaluateAllChecks(null, tasks)` 대신 벤더 계획을 사용. deps에 `resolveCheckPlan`/`evaluatePlan`을 추가하고, `runAnsibleForServer(asset)` 호출에 `plan.evidenceTasks`를 넘긴다:

```ts
// deps 기본값에 추가: resolveCheckPlan, evaluatePlan
const plan = deps.resolveCheckPlan(asset);
tasks = await deps.retryOnConnectionFailure(() => deps.runAnsibleForServer(asset, plan.evidenceTasks));
...
const results: CheckResult[] = deps.evaluatePlan(plan, { findings: null, tasks }, asset);
```
  `ServerScanDeps`에서 `evaluateAllChecks`는 더 이상 쓰지 않으면 제거(다른 사용처 없을 때).

- [ ] **Step 6: 회귀 테스트 갱신** — `ansibleRunner.test.ts`/`serverScan.test.ts`/`orchestrator.test.ts`가 새 시그니처로 깨지면:
  - `runAnsibleForServer`/`runAnsibleChecks` 목 호출 기대에 `extraTasks` 기본값 반영.
  - `serverScan.test.ts`의 deps 목에 `resolveCheckPlan: () => ({ packs:[osUnixPack], evidenceTasks: [] })`, `evaluatePlan: (_p,_c,_a) => [...]` 추가(기존 `evaluateAllChecks` 목을 대체). 기존 결과 개수 단언은 evaluatePlan 목 반환에 맞춰 조정.
  - 실제 명령 실행이 없는 단위 테스트이므로 임시 플레이북 파일 로직은 타지 않는다(extraTasks 빈 배열 경로).

- [ ] **Step 7: 전체 테스트** — `npx vitest run` → 전부 PASS(기존 개수 유지 또는 목 조정분만 변경).

- [ ] **Step 8: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/checks/ansibleRunner.ts src/lib/checks/index.ts src/lib/pipeline/orchestrator.ts src/lib/pipeline/serverScan.ts
git add -A
git commit -m "feat: 파이프라인을 벤더 팩 계획으로 배선(합성 플레이북 + evaluatePlan) (#vendor-scoped-checks)"
```

---

## Task 10: check_results에 framework_id 저장 + 조회 배선

**Files:**
- Modify: `src/lib/db/index.ts` (마이그레이션)
- Modify: `src/lib/checks/store.ts`, `src/lib/checks/types.ts`
- Test: `src/lib/checks/store.test.ts`

**Interfaces:**
- Consumes: `getCatalogItem(id)?.frameworkId`.
- Produces: `check_results.framework_id TEXT`(nullable); `saveCheckResults`가 각 결과의 frameworkId를 카탈로그에서 조회해 저장; `listCheckResults`가 `frameworkId`를 반환; `DecoratedCheckResult.frameworkId`/`source` 필드.

- [ ] **Step 1: 마이그레이션 실패 테스트** — `src/lib/checks/store.test.ts`에 추가:

```ts
import { getCatalogItem } from "@/lib/catalog";

it("persists frameworkId looked up from the catalog", () => {
  const db = createInMemoryDb();
  // ... 기존 테스트의 run 생성 헬퍼 재사용 ...
  saveCheckResults(runId, [{ id: "U-16", status: "pass", evidence: "e" }], db);
  const row = db.prepare(`SELECT framework_id FROM check_results WHERE item_id = 'U-16'`).get() as { framework_id: string };
  expect(row.framework_id).toBe(getCatalogItem("U-16")!.frameworkId);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/checks/store.test.ts`. Expected: FAIL (`no such column: framework_id`).

- [ ] **Step 3: 마이그레이션** — `src/lib/db/index.ts`의 `migrate()`에 기존 ADD COLUMN 패턴대로 추가:

```ts
const checkCols = db.prepare(`PRAGMA table_info(check_results)`).all() as { name: string }[];
if (!checkCols.some((c) => c.name === "framework_id")) {
  db.exec(`ALTER TABLE check_results ADD COLUMN framework_id TEXT`);
}
```
  그리고 초기 `CREATE TABLE IF NOT EXISTS check_results (...)`에도 `framework_id TEXT` 컬럼을 추가(신규 DB용).

- [ ] **Step 4: store 저장/조회** — `store.ts`:
  - INSERT에 `framework_id` 추가, 값은 `getCatalogItem(row.id)?.frameworkId ?? null`:
    ```ts
    import { getCatalogItem } from "@/lib/catalog";
    const insert = db.prepare(
      `INSERT INTO check_results (run_id, item_id, status, evidence, framework_id, created_at)
       VALUES (@runId, @itemId, @status, @evidence, @frameworkId, @createdAt)`,
    );
    // insertMany 내부:
    insert.run({ runId, itemId: row.id, status: row.status, evidence: row.evidence,
                 frameworkId: getCatalogItem(row.id)?.frameworkId ?? null, createdAt: now });
    ```
  - `CheckResultRow`에 `framework_id: string | null` 추가. `listCheckResults` 반환에 `frameworkId: row.framework_id ?? undefined` 포함(단, `CheckResult` 최소형은 유지 — frameworkId는 별도 반환 타입으로).
  - 조회 시 저장값이 null이면(구 데이터) `getCatalogItem(row.item_id)?.frameworkId`로 보정.

- [ ] **Step 5: DecoratedCheckResult 확장** — `types.ts`의 `DecoratedCheckResult`에 추가:
  ```ts
  frameworkId: string | null;
  source: CheckResultSource;  // 이미 있음(rule|ai) — 충돌 주의: 출처(framework)는 별도 필드명 사용
  sourceRef: string | null;   // 카탈로그 source.ref
  ```
  주의: 기존 `source: "rule"|"ai"`와 이름이 겹치지 않게 컴플라이언스 출처는 `frameworkId`+`sourceRef`로 표현한다.
  API 데코레이트 지점(GET /api/runs/[id])에서 `getCatalogItem(id)`로 `frameworkId`, `source.ref`를 채운다.

- [ ] **Step 6: 통과 + 전체 테스트** — `npx vitest run` → PASS.

- [ ] **Step 7: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat: check_results에 framework_id 저장·조회 (#vendor-scoped-checks)"
```

---

## Task 11: 보안 점검 보고서 — 컴플라이언스 필터 + 출처 배지

**Files:**
- Modify: `src/app/runs/[id]/report/ReportView.tsx`
- Test: (UI) 수동 검증 + tsc

**Interfaces:**
- Consumes: `DecoratedCheckResult.frameworkId`, `sourceRef`, `getFrameworks()`.

- [ ] **Step 1: 현재 필터 구조 확인** — `ReportView.tsx`를 열어 항목 목록 렌더와 기존 필터(상태별 등) 상태관리 방식을 파악한다(클라이언트 컴포넌트의 `useState` 필터 패턴).

- [ ] **Step 2: 컴플라이언스 필터 상태 추가** — 기존 필터 옆에 프레임워크 선택 상태 추가:

```tsx
const [frameworkFilter, setFrameworkFilter] = useState<string | null>(null);
const frameworks = getFrameworks(); // "@/lib/catalog"
const presentFrameworkIds = Array.from(
  new Set(checks.map((c) => c.frameworkId).filter((x): x is string => !!x)),
);
const visibleFrameworks = frameworks.filter((f) => presentFrameworkIds.includes(f.id));
```
  `visibleFrameworks.length > 1`일 때만 필터 UI를 노출한다(단일 프레임워크면 필터 무의미).

- [ ] **Step 3: 필터 적용** — 항목 목록을 렌더 전에 거른다:

```tsx
const shownChecks = frameworkFilter
  ? checks.filter((c) => c.frameworkId === frameworkFilter)
  : checks;
```
  그리고 기존 목록 매핑 대상을 `shownChecks`로 교체.

- [ ] **Step 4: 필터 칩 UI** — 상태 필터와 동일 톤으로 "전체 / KISA / CIS" 칩:

```tsx
{visibleFrameworks.length > 1 && (
  <div className="flex items-center gap-2">
    <button onClick={() => setFrameworkFilter(null)} aria-pressed={!frameworkFilter}
      className={chipClass(!frameworkFilter)}>전체</button>
    {visibleFrameworks.map((f) => (
      <button key={f.id} onClick={() => setFrameworkFilter(f.id)} aria-pressed={frameworkFilter === f.id}
        className={chipClass(frameworkFilter === f.id)}>{f.name}</button>
    ))}
  </div>
)}
```
  `chipClass`는 파일 내 기존 칩 스타일을 재사용(없으면 상태 필터 버튼의 className 패턴을 그대로 사용).

- [ ] **Step 5: 각 항목 행에 출처 배지** — 항목 렌더에 출처 표기 추가:

```tsx
{check.frameworkId && (
  <span className="rounded bg-bg px-2 py-0.5 text-[11px] text-muted">
    {frameworks.find((f) => f.id === check.frameworkId)?.name ?? check.frameworkId}
    {check.sourceRef ? ` · ${check.sourceRef}` : ""}
  </span>
)}
```

- [ ] **Step 6: 수동 검증** — 실제 run 하나의 보고서(`/runs/<id>/report`)에서:
  - 현재는 전부 KISA이므로 프레임워크 필터 칩이 (단일이라) 숨겨지거나 KISA만 노출됨을 확인.
  - 각 항목에 `KISA · 웹 서비스 WEB-04` 형태 배지가 보이는지 확인.
  - (CIS 항목은 #2 이후 생기며 그때 필터가 2개 이상으로 활성화됨 — 로직상 자동 동작.)

- [ ] **Step 7: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/app/runs/[id]/report/ReportView.tsx
git add src/app/runs/[id]/report/ReportView.tsx
git commit -m "feat: 점검 보고서 컴플라이언스 필터 + 출처 배지 (#vendor-scoped-checks)"
```

---

## Task 12: 실제 흐름 검증 (Docker nginx 서버 E2E + 회귀)

**Files:**
- (코드 변경 없음 — 검증 태스크. 필요 시 발견된 버그만 최소 수정 후 별도 커밋.)

**Interfaces:** 없음.

- [ ] **Step 1: 전체 단위 테스트 그린 확인** — `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run`. Expected: 전부 PASS.

- [ ] **Step 2: nginx 테스트 서버 기동** — Docker로 SSH+nginx가 있는 컨테이너를 띄운다(기존 테스트 서버 절차 재사용). 예:
  ```bash
  docker run -d --name nhg-nginx -p 2222:22 <ssh+nginx 이미지>
  ```
  (기존에 사용하던 테스트 서버 이미지/기동 스크립트를 그대로 사용.)

- [ ] **Step 3: 자산 등록** — 앱에서 서버 자산을 `category=WEB, vendor=Nginx`로 등록(SSH 접속정보 입력).

- [ ] **Step 4: 실제 점검 실행** — 해당 자산 점검을 돌리고 run 상세를 확인한다. 기대:
  - os-unix(U-*) 항목 + web(WEB-*) 항목이 함께 나온다(베이스라인 합성 규칙).
  - nginx가 실제로 있으므로 WEB 항목이 review-미확인이 아니라 정상 pass/fail/skip으로 판정된다.
  - 결과 항목에 framework_id(KISA)가 저장돼 보고서 배지에 표시된다.

- [ ] **Step 5: 미탐지 경로 검증** — nginx가 없는 서버(또는 nginx 중지)를 `category=WEB, vendor=Nginx`로 등록해 점검 → WEB 항목이 전부 `review`("선언된 Nginx 미확인")로 나오는지 확인.

- [ ] **Step 6: OS 전용 경로 검증** — 서버를 `category=OS, vendor=Ubuntu`로 등록해 점검 → U-* 항목만 나오고 WEB 항목은 없는지 확인.

- [ ] **Step 7: 재실행/정리** — 같은 자산을 재점검해도 동일 결과가 나오는지(중복/재실행 경로), 배치/이력 표시가 정상인지 확인. 검증 후 테스트 컨테이너 정리(`docker rm -f nhg-nginx`).

- [ ] **Step 8: 최종 게이트** — `npx tsc --noEmit && npx eslint <touched> && npx vitest run` 전부 통과 확인. 여기까지 오면 #0 완료.

---

## Self-Review (완료)

- **스펙 커버리지:** 팩 구조(T4–T8)·선택 엔진/베이스라인 합성/미탐지→review(T8)·합성 플레이북(T5,T9)·출처 인용(T1)·카탈로그 필터(T2,T3)·리포트 필터/배지(T10,T11)·실제 점검 검증(T12) 모두 태스크 존재. Windows 팩은 `evaluatePack`의 windows 분기로 계약만 반영(#4에서 팩 추가).
- **스펙 대비 의도적 정제(플래그):** "모든 팩이 evidenceTasks 소유" → 베이스라인 증거(C-*/U-*)는 base 플레이북 유지, 벤더 전용 증거만 팩 소유. 벤더 스코핑 목표는 그대로 달성(비-WEB 자산엔 nginx 태스크 미포함). 실행자/리뷰어는 이 경계를 스펙과 대조할 것.
- **타입 일관성:** `VendorPack.itemIds`/`evidenceTasks`/`detect`/`evaluate`, `resolveCheckPlan`/`evaluatePlan(plan,ctx,asset)`, `runAllChecks(_, _, asset?)`, `check_results.framework_id`가 태스크 전반에서 일치.
- **주의 지점:** `Asset`에 `sourceType`이 없어 `asset.type`(server/repo)로 베이스라인 판별(T8 명시). `DecoratedCheckResult.source`(rule|ai)와 컴플라이언스 출처를 혼동하지 않도록 후자는 `frameworkId`+`sourceRef`로 분리(T10 명시).
