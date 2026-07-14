# 점검 카테고리 사전 선택(소요시간 조절) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 점검 실행 전에 단일 자산의 후보 카테고리(컨테이너/OS/WEB/WAS/DB)를 골라 점검 계획을 좁혀 소요시간을 줄인다. 미선택(전체)이면 기존과 동일.

**Architecture:** `filterPlanByCategories`로 CheckPlan의 packs를 카테고리로 필터하고, `/api/runs`가 받은 `categories`를 파이프라인(runPipeline/runServerScanPipeline)→resolveCheckPlan 뒤 필터로 흘린다. UI는 자산 목록 단일 선택 시 카테고리 체크박스 모달을 띄운다.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest, Tailwind v4.

## Global Constraints

- 테스트/타입/린트/빌드는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- `categories`가 undefined/빈 배열이면 필터는 **no-op**(plan 그대로) — 전체 점검, 회귀 없음.
- 팩 카테고리 어휘: `"container" | "OS" | "WEB" | "WAS" | "DB"`(VendorPack.category).
- 필터 결과 packs가 0개면 **전체 plan으로 폴백**(안전; UI는 최소 1개 강제).
- 스케줄러·리포트 재점검·bulk 스캔은 categories 없이 호출 → 전체(회귀 없음).
- 클라이언트 번들 안전: 카테고리 라벨은 클라이언트에서 별도 상수로 정의(서버 전용 모듈 `resolve.ts`를 클라이언트에서 값 import 금지). resolveCheckPlan 호출은 서버 컴포넌트(page.tsx)에서만.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: `filterPlanByCategories` 필터 함수

**Files:**
- Modify: `src/lib/packs/resolve.ts`
- Test: `src/lib/packs/resolve.test.ts`

**Interfaces:**
- Consumes: `CheckPlan`(`./types`), `mergeEvidenceTasks`(`./playbook`, 이미 import됨).
- Produces: `filterPlanByCategories(plan: CheckPlan, categories: string[] | undefined): CheckPlan`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/packs/resolve.test.ts`에 추가(기존 import에 `filterPlanByCategories` 추가; `resolveCheckPlan`·`repoAsset`/`serverAsset` 헬퍼는 이미 있음):

```ts
import { filterPlanByCategories } from "./resolve";

describe("filterPlanByCategories", () => {
  it("undefined/빈 배열이면 plan 그대로(no-op)", () => {
    const plan = resolveCheckPlan(repoAsset());
    expect(filterPlanByCategories(plan, undefined)).toBe(plan);
    expect(filterPlanByCategories(plan, [])).toBe(plan);
  });
  it("선택 카테고리의 팩만 남기고 evidenceTasks 재계산·mode 보존", () => {
    const plan = resolveCheckPlan(repoAsset()); // autodetect: container·OS·WEB·WAS·DB
    const filtered = filterPlanByCategories(plan, ["DB"]);
    expect(filtered.packs.every((p) => p.category === "DB")).toBe(true);
    expect(filtered.packs.length).toBeGreaterThan(0);
    expect(filtered.mode).toBe(plan.mode);
    // evidenceTasks가 남은 팩 기준(전체보다 같거나 적음)
    expect(filtered.evidenceTasks.length).toBeLessThanOrEqual(plan.evidenceTasks.length);
  });
  it("여러 카테고리 선택 시 합집합", () => {
    const plan = resolveCheckPlan(repoAsset());
    const filtered = filterPlanByCategories(plan, ["OS", "DB"]);
    const cats = new Set(filtered.packs.map((p) => p.category));
    expect([...cats].sort()).toEqual(["DB", "OS"]);
  });
  it("매칭 0개면 전체 plan으로 폴백", () => {
    const plan = resolveCheckPlan(repoAsset());
    const filtered = filterPlanByCategories(plan, ["NONEXISTENT"]);
    expect(filtered).toBe(plan);
  });
});
```
(주: `repoAsset()`/`serverAsset()` 헬퍼는 이 테스트 파일 상단에 이미 정의돼 있다. autodetect plan의 category 값은 container/OS/WEB/WAS/DB.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs/resolve.test.ts`
Expected: FAIL — `filterPlanByCategories` 미정의.

- [ ] **Step 3: 구현**

`src/lib/packs/resolve.ts`에 추가(파일 하단, 다른 export 함수 옆). `mergeEvidenceTasks`는 이미 상단에서 import됨:

```ts
// 점검 계획을 선택된 카테고리로 좁힌다. undefined/빈 배열이면 그대로(전체). 남는 팩이 없으면 안전하게
// 전체 계획으로 폴백. evidenceTasks는 남은 팩 기준으로 재계산해 수집·평가를 줄인다.
export function filterPlanByCategories(plan: CheckPlan, categories: string[] | undefined): CheckPlan {
  if (!categories || categories.length === 0) return plan;
  const allowed = new Set(categories);
  const packs = plan.packs.filter((p) => allowed.has(p.category));
  if (packs.length === 0) return plan;
  return { ...plan, packs, evidenceTasks: mergeEvidenceTasks(packs.map((p) => p.evidenceTasks)) };
}
```
(주: `CheckPlan` 타입이 이 파일에서 이미 참조 가능한지 확인 — `resolveCheckPlan` 반환 타입으로 쓰이므로 import돼 있음. 없으면 `import type { CheckPlan } from "./types";` 추가.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs/resolve.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 클린.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/packs/resolve.ts src/lib/packs/resolve.test.ts
git commit -m "feat: filterPlanByCategories — 점검 계획을 카테고리로 축소(no-op·폴백 안전)"
```

---

### Task 2: 백엔드 threading (runAllChecks·orchestrator·serverScan·/api/runs)

**Files:**
- Modify: `src/lib/checks/index.ts` (runAllChecks categories 인자)
- Modify: `src/lib/pipeline/orchestrator.ts` (runPipeline options → runChecks)
- Modify: `src/lib/pipeline/serverScan.ts` (runServerScanPipeline options → plan 필터)
- Modify: `src/app/api/runs/route.ts` (categories 파싱·전달)
- Test: `src/lib/checks/index.test.ts`

**Interfaces:**
- Consumes: `filterPlanByCategories`(Task 1).
- Produces: `runAllChecks(dockerfilePath, containerName, asset?, categories?: string[])`; `runPipeline(runId, source, deps?, db?, options?: { categories?: string[] })`; `runServerScanPipeline(run, asset, deps?, db?, options?: { categories?: string[] })`.

- [ ] **Step 1: 실패하는 테스트 작성 (runAllChecks categories)**

`src/lib/checks/index.test.ts`에 추가. 이 파일은 이미 `runAnsibleChecks`를 `vi.mock`으로 목킹한다.
기존 테스트는 asset 없이 호출하지만, categories는 `if (asset)` 경로에서만 동작하므로 **repo 자산을
인라인으로 만들어 전달**한다. 태스크 출력이 비어도 필터로 인해 **다른 카테고리 항목 자체가 결과에 없음**을
단언한다(autodetect라 DB 팩은 미탐지 시 DB-*/PG-*를 skip으로 남기지만, 항목 자체는 존재). 파일 상단
import에 `import type { Asset } from "@/lib/assets/types";` 추가:

```ts
const repoAssetFixture = {
  id: "a1", type: "repo", displayName: "img", repoUrl: "https://github.com/nh/x",
  projectId: null, hostIp: null, hostname: null, sshPort: null, authType: null,
  username: null, encryptedSecret: null, os: null, owner: null, category: null,
  vendor: null, dockerfilePath: null, createdAt: "",
} as Asset;

  it("categories=['DB']면 DB 팩만 평가되고 U-*/WEB-* 항목은 결과에 없다", async () => {
    vi.mocked(runAnsibleChecks).mockResolvedValue([]);
    const results = await runAllChecks(undefined, "fake-container", repoAssetFixture, ["DB"]);
    expect(results.some((r) => r.id.startsWith("U-"))).toBe(false);
    expect(results.some((r) => r.id.startsWith("WEB-"))).toBe(false);
    expect(results.some((r) => r.id.startsWith("DB-") || r.id.startsWith("PG-"))).toBe(true);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/checks/index.test.ts`
Expected: FAIL — categories 인자 미지원(전체 평가라 U-*/WEB-* 존재).

- [ ] **Step 3: runAllChecks에 categories 반영**

`src/lib/checks/index.ts`: import에 `filterPlanByCategories` 추가(`resolveCheckPlan, evaluatePlan`과 함께 `@/lib/packs/resolve`에서). 시그니처·계획 적용 수정:
```ts
export async function runAllChecks(
  dockerfilePath: string | undefined,
  containerName: string,
  asset?: Asset,
  categories?: string[],
): Promise<CheckResult[]> {
  const findings = dockerfilePath ? analyzeDockerfile(dockerfilePath) : null;

  if (asset) {
    const plan = filterPlanByCategories(resolveCheckPlan(asset), categories);
    const tasks = await runAnsibleChecks(containerName, plan.evidenceTasks);
    return evaluatePlan(plan, { findings, tasks }, asset);
  }
  // ...기존 하위호환 경로 그대로...
```

- [ ] **Step 4: orchestrator runPipeline에 options 추가**

`src/lib/pipeline/orchestrator.ts`: `runPipeline` 시그니처에 옵션 추가, runChecks 호출에 전달.
```ts
export async function runPipeline(
  runId: string,
  source: RunSource,
  deps: PipelineDeps = defaultDeps,
  db: Database = getDb(),
  options: { categories?: string[] } = {},
): Promise<void> {
```
그리고 `results = await deps.runChecks(dockerfilePath, containerName, asset);`를
`results = await deps.runChecks(dockerfilePath, containerName, asset, options.categories);`로 교체.
(`deps.runChecks: typeof runAllChecks`이므로 Task 3에서 시그니처가 바뀌면 타입 자동 정합.)

- [ ] **Step 5: serverScan runServerScanPipeline에 options 추가**

`src/lib/pipeline/serverScan.ts`: import에 `filterPlanByCategories` 추가(`resolveCheckPlan, evaluatePlan`와 함께 `@/lib/packs/resolve`). 시그니처·plan 필터:
```ts
export async function runServerScanPipeline(
  run: Run,
  asset: Asset,
  deps: ServerScanDeps = defaultDeps,
  db: Database = getDb(),
  options: { categories?: string[] } = {},
): Promise<void> {
  markRunStarted(run.id, db);
  updateRunStage(run.id, "connect", "running", {}, db);
  const plan = filterPlanByCategories(deps.resolveCheckPlan(asset), options.categories);
```
(기존 `const plan = deps.resolveCheckPlan(asset);` 한 줄을 위처럼 필터 적용으로 교체. 이후 plan 사용부는 그대로.)

- [ ] **Step 6: /api/runs가 categories 파싱·전달**

`src/app/api/runs/route.ts`: body에서 categories를 안전 파싱하고, 자산 스캔 시작부에 전달.
`asset` 분기(server/git) 앞에 파싱 추가:
```ts
  const categories = Array.isArray(body?.categories)
    ? body.categories.filter((c: unknown): c is string => typeof c === "string")
    : undefined;
```
서버 경로: `void runServerScanPipeline(run, serverAsset, undefined, undefined, { categories });`
(기존 `void runServerScanPipeline(run, serverAsset);` → deps/db 기본값 자리에 undefined 두고 options 전달. `runServerScanPipeline`의 deps/db는 기본값이 있으므로 undefined면 기본값 사용.)
git 경로: 기존
```ts
  void runPipeline(run.id, {
    type: "git",
    repoUrl: asset.repoUrl!,
    ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
  });
```
를
```ts
  void runPipeline(
    run.id,
    {
      type: "git",
      repoUrl: asset.repoUrl!,
      ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
    },
    undefined,
    undefined,
    { categories },
  );
```
로 교체. (local_image 재점검 경로는 categories 없이 그대로 두어도 됨 — 전체.)

- [ ] **Step 7: 테스트 통과 확인 + 타입/린트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/checks/index.test.ts src/lib/pipeline/orchestrator.test.ts src/lib/pipeline/serverScan.test.ts && npx tsc --noEmit`
Expected: PASS(신규 + 기존 회귀), 타입 클린.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/checks/index.ts src/lib/checks/index.test.ts src/lib/pipeline/orchestrator.ts src/lib/pipeline/serverScan.ts "src/app/api/runs/route.ts"
git commit -m "feat: 점검 카테고리 선택을 /api/runs→파이프라인→계획 필터로 연결"
```

---

### Task 3: UI — 후보 카테고리 노출 + 단일 자산 점검 옵션 모달

**Files:**
- Modify: `src/app/assets/page.tsx` (scanCategories 계산·전달)
- Modify: `src/app/assets/AssetTable.tsx` (AssetRowData.scanCategories + 단일 점검 모달)

**Interfaces:**
- Consumes: `resolveCheckPlan`(`@/lib/packs/resolve`, 서버에서만), `Modal`(`../_components/Modal`).

- [ ] **Step 1: page.tsx에서 scanCategories 계산·전달**

`src/app/assets/page.tsx`: import에 `import { resolveCheckPlan } from "@/lib/packs/resolve";` 추가.
자산 row 빌드(`assets.map((asset) => { ... })`)의 반환 객체에 `kind` 다음 줄 추가:
```ts
              kind: classifyAssetKind(asset),
              scanCategories: [...new Set(resolveCheckPlan(asset).packs.map((p) => p.category))],
```

- [ ] **Step 2: AssetRowData에 scanCategories + CATEGORY_LABEL + 모달**

`src/app/assets/AssetTable.tsx`:
- import 추가: `import { Modal } from "../_components/Modal";`
- `AssetRowData`에 `kind: AssetKind` 다음 줄 추가:
```ts
  kind: AssetKind;
  scanCategories: string[]; // 이 자산 점검 계획의 후보 카테고리(container/OS/WEB/WAS/DB)
```
- 파일 상단 상수에 클라이언트 라벨 맵 추가(서버 모듈 import 아님):
```tsx
const CATEGORY_LABEL: Record<string, string> = {
  container: "컨테이너", OS: "OS", WEB: "WEB", WAS: "WAS", DB: "DB",
};
```
- 컴포넌트 상태에 추가(기존 useState 근처):
```tsx
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanCats, setScanCats] = useState<string[]>([]);
```
- `handleScan`을 단일/다중 분기로 교체:
```tsx
  const handleScan = () => {
    if (selectedIds.length === 1) {
      const row = rows.find((r) => r.id === selectedIds[0]);
      setScanCats(row ? [...row.scanCategories] : []);
      setScanModalOpen(true);
      return;
    }
    runAction(async () => {
      const { ok, data } = await callBulk("/api/assets/bulk/scan", "POST", {});
      // ...기존 handleScan 본문의 성공/결과 처리 그대로...
    });
  };
```
(주: 기존 `handleScan`의 bulk 성공 처리 로직을 그대로 옮겨 유지할 것. 아래 단일 점검 실행 함수는 별도.)

- 단일 점검 실행 함수 추가:
```tsx
  async function startSingleScan() {
    const assetId = selectedIds[0];
    if (!assetId || scanCats.length === 0) return;
    await runAction(async () => {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, categories: scanCats }),
      });
      if (res.ok) {
        setScanModalOpen(false);
        setMessage("점검을 시작했습니다");
      } else {
        setMessage("점검 시작에 실패했습니다");
      }
    });
  }
```
(주: `runAction`/`setMessage`는 이 컴포넌트에 이미 있는 헬퍼. `runAction`이 busy 토글·refresh를 담당하는지 확인해 중복 없이 사용. res.ok 아닐 때 처리 포함.)

- 모달 렌더(컴포넌트 반환 JSX 최상위, 기존 패널들 옆에 추가):
```tsx
      <Modal open={scanModalOpen} onClose={() => setScanModalOpen(false)} title="점검 카테고리 선택">
        <p className="text-[13px] text-muted">점검할 카테고리를 고르면 대상 항목과 소요시간이 줄어듭니다.</p>
        <div className="mt-3 flex flex-col gap-2">
          {(rows.find((r) => r.id === selectedIds[0])?.scanCategories ?? []).map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={scanCats.includes(cat)}
                onChange={(e) =>
                  setScanCats((prev) =>
                    e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                  )
                }
              />
              {CATEGORY_LABEL[cat] ?? cat}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setScanModalOpen(false)}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted hover:bg-bg"
          >
            취소
          </button>
          <button
            type="button"
            onClick={startSingleScan}
            disabled={busy || scanCats.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            점검 시작
          </button>
        </div>
      </Modal>
```

- [ ] **Step 3: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/assets/page.tsx" "src/app/assets/AssetTable.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 4: 전체 테스트 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run 2>&1 | tail -3`
Expected: 전부 통과.

```bash
git add "src/app/assets/page.tsx" "src/app/assets/AssetTable.tsx"
git commit -m "feat: 자산 목록 단일 점검 시 카테고리 선택 모달(소요시간 조절)"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 자산 1개 선택 → "점검" → 카테고리 모달(기본 전체 체크), 일부 해제 후 시작 → 좁혀진 항목만 점검·소요시간 단축 확인(예: postgres 이미지 "DB만").
- 자산 2개 이상 선택 → "점검"은 기존 bulk 전체 점검(모달 없음) 확인.
- 전부 해제 시 "점검 시작" 비활성 확인.
- 스케줄/리포트 재점검이 전체 점검으로 회귀 없는지.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul) + 고정 URL 200 확인.
