# 다중 이미지 통합 UX + 리소스 분산 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다중 이미지 자산의 점검을 자산 중심으로 표시·필터하고, 프로젝트 뷰에 자산별 상태·실시간 갱신을 더하며, repo 빌드 동시성을 낮추고 클론을 정리해 리소스 고갈을 막는다.

**Architecture:** run.assetId를 UI에서 resolve해 자산명으로 표시(A). 프로젝트 뷰에 getAssetStatusMap 상태 컬럼 + 진행 중일 때 router.refresh 폴링(B). fleet 실행 시 repo 빌드를 서버 SSH와 분리해 낮은 동시성으로 돌리고, orchestrator가 git 클론을 종료 시 삭제(C). 스키마 변경 없음.

**Tech Stack:** Next.js 16 App Router, better-sqlite3, vitest. 실행 Node v20+ (테스트 `nvm use v24.16.0`).

**Spec:** `docs/superpowers/specs/2026-07-11-multi-image-integration-ux-design.md`

## Global Constraints

- 스키마 변경 없음. run.assetId(기존)·getAssetStatusMap(기존, #69)·getRepoDisplayName(기존) 재사용.
- 기존 동작 보존: 서버 SSH fleet 동시성 5 유지, 단일 repo 자산(자동탐색)·로컬 이미지 run(자산 없음) 표시는 repoUrl 폴백으로 하위호환.
- repo 빌드 동시성 기본 **2**, `REPO_SCAN_CONCURRENCY` env로 조정(무효/미설정 시 2).
- git run은 클론 `data/repos/<runId>`를 파이프라인 모든 종료 경로(성공/빌드실패/샌드박스·앤서블실패/취소)에서 삭제. `local_image`는 클론 없음 → 대상 아님.
- Kinetic 레시피 준수(StatusBadge/SectionLabel/테이블), `[var(--color-*)]` 금지.
- 검증: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 그린(현재 714 + 신규), `npx eslint <파일>`·`npx tsc --noEmit` clean. 보고 전 실제 출력 확인.
- 커밋: 한국어 conventional commit + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. 각 태스크 독립 커밋.
- dev 서버(localhost:3000) 죽이지 말 것.

---

### Task 1: runDisplayIdentity 헬퍼 (A-core)

**Files:**
- Create: `src/lib/pipeline/runIdentity.ts`, `src/lib/pipeline/runIdentity.test.ts`

**Interfaces:**
- Consumes: `getRepoDisplayName`(`@/lib/pipeline/repoUrl`).
- Produces:
```ts
export interface RunIdentity { label: string; secondary: string; filterAssetId: string | null; }
export function runDisplayIdentity(
  run: { repoUrl: string; assetId: string | null },
  assetsById: Map<string, { displayName: string }>,
): RunIdentity
```

- [ ] **Step 1: 실패 테스트 작성** — `runIdentity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runDisplayIdentity } from "./runIdentity";

describe("runDisplayIdentity", () => {
  it("자산이 있으면 자산명을 label, repoUrl을 secondary, assetId를 필터대상으로", () => {
    const m = new Map([["a1", { displayName: "ocpm / backend/Dockerfile" }]]);
    expect(runDisplayIdentity({ repoUrl: "https://github.com/o/ocpm", assetId: "a1" }, m)).toEqual({
      label: "ocpm / backend/Dockerfile",
      secondary: "https://github.com/o/ocpm",
      filterAssetId: "a1",
    });
  });
  it("assetId가 null이면 repoUrl 표시명으로 폴백, 필터대상 없음", () => {
    const r = runDisplayIdentity({ repoUrl: "nginx:alpine", assetId: null }, new Map());
    expect(r.label.length).toBeGreaterThan(0);
    expect(r.secondary).toBe("nginx:alpine");
    expect(r.filterAssetId).toBeNull();
  });
  it("assetId가 있지만 맵에 없으면(삭제된 자산) repoUrl 폴백", () => {
    const r = runDisplayIdentity({ repoUrl: "https://github.com/o/r", assetId: "gone" }, new Map());
    expect(r.filterAssetId).toBeNull();
    expect(r.secondary).toBe("https://github.com/o/r");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/pipeline/runIdentity.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `runIdentity.ts`:

```ts
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";

export interface RunIdentity {
  label: string;
  secondary: string;
  filterAssetId: string | null;
}

export function runDisplayIdentity(
  run: { repoUrl: string; assetId: string | null },
  assetsById: Map<string, { displayName: string }>,
): RunIdentity {
  const asset = run.assetId ? assetsById.get(run.assetId) : undefined;
  if (asset) {
    return { label: asset.displayName, secondary: run.repoUrl, filterAssetId: run.assetId };
  }
  return { label: getRepoDisplayName(run.repoUrl), secondary: run.repoUrl, filterAssetId: null };
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/pipeline/runIdentity.test.ts` → PASS; `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/lib/pipeline/runIdentity.ts src/lib/pipeline/runIdentity.test.ts && git commit -m "feat: runDisplayIdentity — run을 자산 중심으로 식별 (#multi-image-ux)"` (+trailer)

---

### Task 2: /runs·배치 뷰 자산별 표시 + 자산 필터 (A-views)

**Files:**
- Modify: `src/app/runs/page.tsx`, `src/app/runs/batch/[batchId]/page.tsx`

**Interfaces:**
- Consumes: `runDisplayIdentity`(Task 1), `listAssets`(`@/lib/assets/store`).

- [ ] **Step 1: `/runs` 자산 맵 + 식별 + asset 필터**
  - `searchParams` 타입에 `asset?: string` 추가. 구조분해에 `asset` 포함.
  - 필터: `const runs = asset ? allRuns.filter((r) => r.assetId === asset) : repo ? allRuns.filter((r) => r.repoUrl === repo) : allRuns;`
  - `import { listAssets } from "@/lib/assets/store";` `import { runDisplayIdentity } from "@/lib/pipeline/runIdentity";`
  - `const assetsById = new Map(listAssets().map((a) => [a.id, a]));`
  - run 루프 안에서 `const id = runDisplayIdentity(run, assetsById);` 로 "점검 대상" 셀 교체:
    - 1행(제목 링크): `{id.label}` (링크 대상은 기존과 동일: running이면 `/runs/${run.id}`, 아니면 `/runs/${run.id}/report`).
    - 2행(보조 링크): `id.filterAssetId`가 있으면 `href={\`/runs?asset=${id.filterAssetId}\`}` title "이 자산 이력만 보기", 텍스트는 `id.secondary`; 없으면 기존처럼 `href={\`/runs?repo=${encodeURIComponent(run.repoUrl)}\`}` 텍스트 `run.repoUrl`.
  - 필터 배너: `asset`일 때 자산명 기준 문구(`assetsById.get(asset)?.displayName ?? asset`), `repo`일 때 기존 문구 유지. "전체 보기" 링크는 `/runs`.
- [ ] **Step 2: 배치 뷰 동일 적용** — `batch/[batchId]/page.tsx`: `listAssets` 맵 + `runDisplayIdentity`로 run "점검 대상" 셀을 자산명 우선 표시(현재 `run.repoUrl` 직접 표시 부분). 헤더 카피 "서버 일괄 점검 결과"/"서버 N대"는 자산 혼합을 반영해 "일괄 점검 결과"/"자산 N개"로 일반화(진행 중 N개 문구 유지).
- [ ] **Step 3: 검증** — `npm test` 전체 그린(UI라 신규 유닛테스트 필수 아님, 헬퍼는 Task 1이 커버); `npx eslint src/app/runs/`·`npx tsc --noEmit` clean. dev 서버에서 ocpm run들이 자산명으로 구분되고 `?asset=` 필터가 자산별로 거르는지 확인(세션 쿠키로).
- [ ] **Step 4: Commit** — `git add src/app/runs/ && git commit -m "feat: 점검 이력·배치를 자산명으로 구분 표시, 자산별 필터 (#multi-image-ux)"` (+trailer)

---

### Task 3: 프로젝트 뷰 자산별 상태 + 실시간 갱신 (B)

**Files:**
- Create: `src/app/_components/assetStatusBadge.ts`, `src/app/projects/[id]/AutoRefresh.tsx`
- Modify: `src/app/projects/[id]/page.tsx`, `src/app/assets/page.tsx`(공용 배지 맵으로 교체)

**Interfaces:**
- Consumes: `getAssetStatusMap`(`@/lib/pipeline/assetStatus`), `AssetStatusKind`, `StatusBadge`.
- Produces: `ASSET_STATUS_BADGE: Record<AssetStatusKind, { status: BadgeStatus; label: string }>` (공용); `<AutoRefresh active={boolean} intervalMs?={number} />`.

- [ ] **Step 1: 공용 배지 맵 추출** — `src/app/assets/page.tsx`의 `STATUS_BADGE` 상수(kind→{status,label} 매핑, 6종 pass/fail/review/error/running/cancelled/none 전부)를 `src/app/_components/assetStatusBadge.ts`로 이동해 `export const ASSET_STATUS_BADGE`로 노출. `assets/page.tsx`는 이 상수를 import해서 사용(동작 불변). 값은 기존과 동일:
```ts
import type { AssetStatusKind } from "@/lib/pipeline/assetStatus";
import type { BadgeStatus } from "./statusBadgeStyles";

export const ASSET_STATUS_BADGE: Record<AssetStatusKind, { status: BadgeStatus; label: string }> = {
  pass: { status: "pass", label: "양호" },
  fail: { status: "fail", label: "취약" },
  review: { status: "review", label: "검토" },
  error: { status: "fail", label: "실패" },
  running: { status: "progress", label: "진행 중" },
  cancelled: { status: "neutral", label: "취소됨" },
  none: { status: "neutral", label: "미점검" },
};
```
  (assets/page.tsx의 기존 STATUS_BADGE 정의를 삭제하고 이 import로 대체 — 라벨/색 동일 확인.)

- [ ] **Step 2: AutoRefresh client 컴포넌트** — `src/app/projects/[id]/AutoRefresh.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
```

- [ ] **Step 3: 프로젝트 뷰에 상태 컬럼 + AutoRefresh** — `src/app/projects/[id]/page.tsx`:
  - import: `getAssetStatusMap`(`@/lib/pipeline/assetStatus`), `StatusBadge`, `ASSET_STATUS_BADGE`, `AutoRefresh`.
  - `const statusMap = getAssetStatusMap();` `const anyRunning = assets.some((a) => statusMap.get(a.id)?.kind === "running");`
  - 소속 자산 테이블 헤더에 "상태" `<th>`(SectionLabel) 추가, 각 행에 상태 셀 추가:
    `const badge = ASSET_STATUS_BADGE[statusMap.get(asset.id)?.kind ?? "none"];` → `<StatusBadge status={badge.status}>{badge.label}</StatusBadge>`.
  - 페이지 상단(main 내부 아무 곳)에 `<AutoRefresh active={anyRunning} />` 렌더.

- [ ] **Step 4: 검증** — `npm test` 전체 그린(getAssetStatusMap 기존 테스트 재사용, assets/page 배지 동작 불변); `npx eslint src/app/projects/ src/app/assets/page.tsx src/app/_components/assetStatusBadge.ts`·`npx tsc --noEmit` clean. dev 서버에서 프로젝트 뷰에 자산별 상태 배지가 뜨고, 진행 중 run이 있을 때 3초마다 갱신되는지 확인.

- [ ] **Step 5: Commit** — `git add src/app/projects/ src/app/assets/page.tsx src/app/_components/assetStatusBadge.ts && git commit -m "feat: 프로젝트 뷰 자산별 상태 컬럼 + 진행 중 실시간 갱신 (#multi-image-ux)"` (+trailer)

---

### Task 4: repo 빌드 동시성 분리 (C-concurrency)

**Files:**
- Modify: `src/lib/pipeline/serverScan.ts`
- Modify(test): `src/lib/pipeline/serverScan.test.ts`

**Interfaces:**
- Produces: repo 태스크는 `REPO_SCAN_CONCURRENCY`(env, 기본 2) 한도로, 서버 태스크는 `FLEET_SCAN_CONCURRENCY`(5) 한도로 실행.

- [ ] **Step 1: 실패 테스트 작성** — `serverScan.test.ts`에 env 파싱 + 분리 실행 검증 추가. env 파싱은 별도 노출 함수로 테스트하기 쉽게:
```ts
it("REPO_SCAN_CONCURRENCY 파싱: 유효/무효/미설정", () => {
  expect(repoScanConcurrency({})).toBe(2);
  expect(repoScanConcurrency({ REPO_SCAN_CONCURRENCY: "3" })).toBe(3);
  expect(repoScanConcurrency({ REPO_SCAN_CONCURRENCY: "abc" })).toBe(2);
  expect(repoScanConcurrency({ REPO_SCAN_CONCURRENCY: "0" })).toBe(2);
});
```
  (분리 실행 자체는 관찰이 까다로우면 이 파싱 단위 테스트로 핵심을 못박고, startProjectFleetScan이 repo 태스크에 repo 한도를 넘기는지는 코드 리뷰로 확인 — 최소 파싱 테스트는 필수.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/pipeline/serverScan.test.ts` → FAIL(`repoScanConcurrency` 없음).

- [ ] **Step 3: 구현** — `serverScan.ts`:
```ts
export function repoScanConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REPO_SCAN_CONCURRENCY;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 2;
}
```
  `startProjectFleetScan`·`scanProjectFleet`에서 server/repo 태스크 풀을 분리 실행:
  - `startProjectFleetScan`(fire-and-forget): 기존 `void runWithConcurrency([...serverTasks, ...repoTasks], FLEET_SCAN_CONCURRENCY)` →
    `void Promise.all([ runWithConcurrency(serverTasks, FLEET_SCAN_CONCURRENCY), runWithConcurrency(repoTasks, repoScanConcurrency()) ]);`
  - `scanProjectFleet`(await): `await Promise.all([ runWithConcurrency(serverTasks, FLEET_SCAN_CONCURRENCY), runWithConcurrency(repoTasks, repoScanConcurrency()) ]);`
  - `{ batchId, runIds }` 구성 불변(serverTasks/repoTasks가 각각 자기 runId를 push하는 기존 구조 유지).

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/pipeline/serverScan.test.ts` → PASS; `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/lib/pipeline/serverScan.ts src/lib/pipeline/serverScan.test.ts && git commit -m "feat: repo 빌드 동시성을 서버와 분리(기본 2, REPO_SCAN_CONCURRENCY) (#multi-image-ux)"` (+trailer)

---

### Task 5: git 클론 정리 (C-cleanup)

**Files:**
- Modify: `src/lib/pipeline/orchestrator.ts`
- Modify(test): `src/lib/pipeline/orchestrator.test.ts`

**Interfaces:**
- git 소스 run은 클론 성공 이후 모든 종료 경로에서 `data/repos/<runId>`(=repoDir) 삭제.

배경: orchestrator는 `repoDir`를 git(else) 분기에서 지역 선언하고, 성공 시 최종 try/finally에서 `removeImage`만 한다. 클론 삭제 로직이 없어 매 git run이 클론을 남긴다. 또 build 단계 조기 return들은 최종 try/finally에 도달하지 않는다.

- [ ] **Step 1: 실패 테스트 작성** — `orchestrator.test.ts`에 추가(임시 디렉터리를 clone 결과로 반환):
```ts
it("git run 성공 후 클론 디렉터리를 삭제한다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clone-"));
  fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
  const run = createRun("https://github.com/o/r.git", "git", null, db);
  const deps = baseDeps();
  deps.clone = vi.fn().mockResolvedValue({ dir });
  deps.detectDockerfile = vi.fn().mockReturnValue(path.join(dir, "Dockerfile"));
  await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);
  expect(fs.existsSync(dir)).toBe(false);
});

it("git run이 build 단계에서 실패해도 클론을 삭제한다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clone-"));
  fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
  const run = createRun("https://github.com/o/r.git", "git", null, db);
  const deps = baseDeps();
  deps.clone = vi.fn().mockResolvedValue({ dir });
  deps.detectDockerfile = vi.fn().mockReturnValue(path.join(dir, "Dockerfile"));
  deps.build = vi.fn().mockRejectedValue(new Error("docker build exited 1"));
  await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);
  expect(fs.existsSync(dir)).toBe(false);
});
```
  (import에 `fs`,`os`,`path` 확보 — Task/기존에서 이미 있을 수 있음.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/pipeline/orchestrator.test.ts` → FAIL(디렉터리가 남음).

- [ ] **Step 3: 구현** — `orchestrator.ts` (구현자는 함수 전체를 읽고 아래를 정확히 배치):
  - `repoDir`를 상단 선언부(`let imageTag`/`let dockerfilePath` 옆)로 **호이스팅**: `let repoDir: string | undefined;`. git 분기의 `let repoDir: string;`는 `repoDir = result.dir;` 할당으로 변경.
  - 멱등 정리 헬퍼를 함수 내에 정의:
```ts
    const cleanupClone = () => {
      if (!repoDir) return;
      try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      repoDir = undefined;
    };
```
  - `cleanupClone()`를 **클론 성공 이후의 모든 종료 경로**에서 호출:
    - git 분기 내 build 관련 조기 `return` 각각 직전(“지정된 Dockerfile 없음/경로 유효하지 않음/자동탐색 실패/도커 빌드 실패”),
    - 그리고 sandbox/ansible/claude를 감싼 **최종 `finally`** 안(기존 `removeImage` 옆).
    호이스팅+멱등 덕에 어느 경로든 정확히 한 번 삭제된다. `local_image`는 `repoDir`가 undefined라 no-op.
  - `import fs from "fs";`가 없으면 추가(파일 상단; 기존 존재 여부 확인).

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/pipeline/orchestrator.test.ts` → PASS(신규 2 + 기존 전부); `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts && git commit -m "fix: git 점검 종료 시 클론 디렉터리 정리(디스크 누수 차단) (#multi-image-ux)"` (+trailer)

---

## 최종 검증 + 머지

- [ ] `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 PASS
- [ ] `npm run lint`·`npx tsc --noEmit`·`npm run build` clean
- [ ] dev 서버 스모크(세션 쿠키): 소규모 ocpm 프로젝트에서 일괄 실행 → (A) 이력·배치가 자산명으로 구분·`?asset=` 필터 동작, (B) 프로젝트 뷰 자산별 상태 배지 + 진행 중 실시간 갱신, (C) 동시 빌드가 2개 이하 유지되고 run 종료 후 `data/repos`에 클론이 안 남는지 확인.
- [ ] whole-branch 리뷰 통과 후 main 머지·푸시(사용자 확인).
