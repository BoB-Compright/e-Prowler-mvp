# 레포 가져오기 → 이미지별 자산 → 일괄 점검 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레포 URL 하나를 가져오면 레포 내 모든 Dockerfile을 발견해 이미지별 자산으로 만들고, 하나의 프로젝트로 묶어 일괄(fleet) 점검한다.

**Architecture:** 각 Dockerfile = `dockerfilePath`를 가진 개별 repo 자산. 발견은 `listDockerfiles`, 등록은 discover/create API + import UI, 실행은 프로젝트 fleet scan(repo 자산 지원 추가)이 이미지별 git run을 생성해 `runPipeline`으로 처리. orchestrator는 `RunSource.dockerfilePath`를 참조.

**Tech Stack:** Next.js 16 App Router, better-sqlite3, vitest. 실행 Node v20+ (테스트 `nvm use v24.16.0`).

**Spec:** `docs/superpowers/specs/2026-07-10-multi-image-repo-import-design.md`

## Global Constraints

- 기존 동작 100% 보존: `dockerfilePath`가 null인 repo 자산은 자동 탐색(현행), server 자산·기존 fleet 무변경.
- `detectDockerfile` 시그니처·선택순위 불변(내부적으로 `listDockerfiles`의 첫 요소).
- 새 API 2개(discover/create)는 보호 API → 각 핸들러 첫 줄에 `requireApiSession(req)` (그 결과가 truthy면 그 응답 반환). `/api/share`·`/api/auth`는 예외이나 여기 해당 없음.
- 스키마 변경은 멱등 `ALTER TABLE ... ADD COLUMN`(기존 os/owner/share_status 패턴, `src/lib/db/index.ts`의 PRAGMA table_info 가드).
- Kinetic 디자인 레시피 준수(입력 필드/버튼/Card/SectionLabel, `[var(--color-*)]` 금지) — DESIGN.md.
- 커밋: 한국어 conventional commit + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. 각 태스크 독립 커밋.
- 검증: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 그린(현재 689 + 신규), `npx eslint <파일>`(테스트 포함)·`npx tsc --noEmit` clean. 보고 전 실제 출력 확인(허위 보고는 리뷰에서 적발됨).
- dev 서버(localhost:3000) 죽이지 말 것.

---

### Task 1: Asset 모델 — dockerfilePath 필드 + (repoUrl, path) 중복검사

**Files:**
- Modify: `src/lib/assets/types.ts`, `src/lib/db/index.ts`, `src/lib/assets/store.ts`
- Modify(test): `src/lib/assets/store.test.ts`(있으면) 또는 신규 `store.test.ts`

**Interfaces:**
- Produces: `Asset.dockerfilePath: string | null`; `createRepoAsset(input: { displayName, repoUrl, projectId?, os?, owner?, dockerfilePath? }, db?)` — 중복은 `(정규화된 repoUrl, dockerfilePath)` 조합 기준.

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/assets/store.test.ts`에 추가(없으면 `createInMemoryDb` 사용해 신규 작성; 기존 테스트 파일 패턴 따름):

```ts
it("같은 repoUrl이라도 dockerfilePath가 다르면 각각 생성된다", () => {
  const db = createInMemoryDb();
  const a = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/o/r", dockerfilePath: "backend/Dockerfile" }, db);
  const b = createRepoAsset({ displayName: "b", repoUrl: "https://github.com/o/r", dockerfilePath: "frontend/Dockerfile" }, db);
  expect(a.dockerfilePath).toBe("backend/Dockerfile");
  expect(b.dockerfilePath).toBe("frontend/Dockerfile");
});

it("같은 (repoUrl, dockerfilePath)는 중복으로 거부한다", () => {
  const db = createInMemoryDb();
  createRepoAsset({ displayName: "a", repoUrl: "https://github.com/o/r", dockerfilePath: "backend/Dockerfile" }, db);
  expect(() => createRepoAsset({ displayName: "a2", repoUrl: "https://github.com/o/r", dockerfilePath: "backend/Dockerfile" }, db)).toThrow(DuplicateAssetError);
});

it("dockerfilePath 없는(null) 레포끼리도 중복으로 거부한다", () => {
  const db = createInMemoryDb();
  createRepoAsset({ displayName: "a", repoUrl: "https://github.com/o/r" }, db);
  expect(() => createRepoAsset({ displayName: "a2", repoUrl: "https://github.com/o/r" }, db)).toThrow(DuplicateAssetError);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/assets/store.test.ts` → FAIL(타입에 dockerfilePath 없음/중복로직 미반영).

- [ ] **Step 3: 구현**
  - `types.ts`: `Asset`에 `dockerfilePath: string | null;` 추가(os/owner 근처).
  - `db/index.ts`: assets 테이블 마이그레이션에 os/owner와 동일한 가드로 `ALTER TABLE assets ADD COLUMN dockerfile_path TEXT` 추가(기존 os/owner ALTER 블록 바로 뒤, `PRAGMA table_info(assets)`에 `dockerfile_path` 없을 때만).
  - `store.ts`:
    - `AssetRow`에 `dockerfile_path: string | null;` 추가.
    - `toAsset`에 `dockerfilePath: row.dockerfile_path,` 추가.
    - `INSERT_SQL`의 컬럼·VALUES에 `dockerfile_path`/`@dockerfile_path` 추가.
    - `createRepoAsset` input 타입에 `dockerfilePath?: string | null;` 추가. 중복 쿼리를 조합 기준으로 교체:
```ts
  const normalized = normalizeRepoUrl(input.repoUrl);
  const dfPath = input.dockerfilePath ?? null;
  const existing = db
    .prepare(`SELECT * FROM assets WHERE type = 'repo' AND repo_url = ? AND dockerfile_path IS ?`)
    .get(normalized, dfPath) as AssetRow | undefined;
  if (existing) {
    throw new DuplicateAssetError(`이미 등록된 레포입니다: ${normalized}${dfPath ? ` (${dfPath})` : ""}`);
  }
```
    - `row`에 `dockerfile_path: dfPath,` 추가. `createServerAsset`의 row에도 `dockerfile_path: null,` 추가(INSERT 컬럼 정합).

  주의: SQLite `IS`는 NULL-안전 동등비교라 `dockerfile_path IS NULL`도 매칭된다.

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/assets/store.test.ts` → PASS; `npm test` 전체 PASS; `npx eslint src/lib/assets/ src/lib/db/index.ts`·`npx tsc --noEmit` clean. (기존 서버/자산 테스트가 Asset 새 필드로 깨지면 그 fixture에 `dockerfilePath: null` 추가.)

- [ ] **Step 5: Commit** — `git add src/lib/assets/ src/lib/db/index.ts && git commit -m "feat: Asset에 dockerfilePath 추가, (repoUrl,path) 조합 중복검사 (#multi-image)"` (+trailer)

---

### Task 2: listDockerfiles + detectDockerfile 리팩터

**Files:**
- Modify: `src/lib/pipeline/dockerfile.ts`, `src/lib/pipeline/dockerfile.test.ts`

**Interfaces:**
- Produces: `listDockerfiles(repoDir: string): string[]` — 모든 Dockerfile 후보의 **절대경로**를 기존 선택순위(깊이→exact→사전순)로 정렬 반환(제외 디렉터리·확장자 데니리스트 동일 적용). `detectDockerfile(repoDir)`는 `listDockerfiles(repoDir)[0] ?? undefined`.

- [ ] **Step 1: 실패 테스트 작성** — `dockerfile.test.ts`에 추가:

```ts
describe("listDockerfiles", () => {
  it("모든 후보를 선택순위로 정렬해 반환한다", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "b")); fs.mkdirSync(path.join(dir, "a"));
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "a", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "b", "Dockerfile"), "FROM scratch\n");
    expect(listDockerfiles(dir)).toEqual([
      path.join(dir, "Dockerfile"),
      path.join(dir, "a", "Dockerfile"),
      path.join(dir, "b", "Dockerfile"),
    ]);
  });
  it("제외 디렉터리·데니리스트 확장자는 목록에서 빠진다", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "node_modules", "p"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "p", "Dockerfile"), "x");
    fs.writeFileSync(path.join(dir, "Dockerfile.md"), "x");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(listDockerfiles(dir)).toEqual([path.join(dir, "Dockerfile")]);
  });
  it("detectDockerfile은 listDockerfiles의 첫 요소와 같다", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(listDockerfiles(dir)[0]);
  });
});
```
(import 줄에 `listDockerfiles` 추가.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/pipeline/dockerfile.test.ts` → FAIL(`listDockerfiles` 없음).

- [ ] **Step 3: 구현** — `dockerfile.ts`에서 후보 수집·정렬 로직을 `listDockerfiles`로 노출하고 `detectDockerfile`은 그 첫 요소를 반환하도록 변경. 현재 `detectDockerfile`이 내부에서 `candidates` 수집 후 `sort`하고 `candidates[0].absPath`를 반환하는데, 이 수집+정렬을 새 `export function listDockerfiles(repoDir): string[]`로 옮겨 정렬된 절대경로 배열을 반환하고, `detectDockerfile`은:
```ts
export function detectDockerfile(repoDir: string): string | undefined {
  return listDockerfiles(repoDir)[0];
}
```
`isDockerfileName`·`EXCLUDED_DIRS`·`MAX_DEPTH`·`MAX_ENTRIES`·데니리스트·two-pass 순회·정렬 비교자는 그대로 `listDockerfiles` 안으로. 반환은 `candidates.sort(...).map(c => c.absPath)`.

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/pipeline/dockerfile.test.ts` → PASS(기존 detectDockerfile 케이스 포함 전부); `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/lib/pipeline/dockerfile.ts src/lib/pipeline/dockerfile.test.ts && git commit -m "feat: listDockerfiles 추가, detectDockerfile을 그 첫 요소로 리팩터 (#multi-image)"` (+trailer)

---

### Task 3: RunSource.dockerfilePath 전달 + orchestrator 우선 사용

**Files:**
- Modify: `src/lib/pipeline/orchestrator.ts`, `src/app/api/runs/route.ts`
- Modify(test): `src/lib/pipeline/orchestrator.test.ts`

**Interfaces:**
- Consumes: `detectDockerfile`(Task 2).
- Produces: `RunSource` git 변형 = `{ type: "git"; repoUrl: string; dockerfilePath?: string }`. orchestrator는 `source.dockerfilePath`가 있으면 `path.join(repoDir, source.dockerfilePath)` 존재 확인 후 사용(없으면 build 실패 `"지정된 Dockerfile을 찾을 수 없습니다: <경로>"`), 없으면 `detectDockerfile`.

- [ ] **Step 1: 실패 테스트 작성** — `orchestrator.test.ts`에 추가:

```ts
it("source.dockerfilePath가 지정되면 자동탐색 대신 그 경로로 빌드한다", async () => {
  const run = createRun("https://github.com/owner/repo.git", "git", null, db);
  const deps = baseDeps();
  deps.clone = vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" });
  const detectSpy = vi.fn();
  deps.detectDockerfile = detectSpy;
  // 존재 확인을 위해 fs를 실제로 만들지 않고, orchestrator가 fs.existsSync를 쓰면
  // 이 테스트는 존재하는 임시 파일로 대체한다(아래 구현 노트 참고).
  await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl, dockerfilePath: "backend/Dockerfile" }, deps, db);
  expect(detectSpy).not.toHaveBeenCalled();
  expect(deps.build).toHaveBeenCalledWith(expect.stringContaining("backend/Dockerfile"), `scan-${run.id}`);
});
```

구현·테스트 노트: orchestrator가 지정 경로 존재를 `fs.existsSync`로 검사하면 테스트에서 실제 경로가 없어 실패한다. 이를 피하려고 **존재 확인을 주입 가능한 deps로 두지 말고**, 테스트에서 실제 임시 디렉터리를 만들어 `deps.clone`이 그 디렉터리를 반환하고 그 안에 `backend/Dockerfile`을 생성하도록 한다. 즉 위 테스트를 다음으로 작성:

```ts
it("source.dockerfilePath가 지정되면 자동탐색 대신 그 경로로 빌드한다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-"));
  fs.mkdirSync(path.join(dir, "backend"));
  fs.writeFileSync(path.join(dir, "backend", "Dockerfile"), "FROM scratch\n");
  const run = createRun("https://github.com/owner/repo.git", "git", null, db);
  const deps = baseDeps();
  deps.clone = vi.fn().mockResolvedValue({ dir });
  deps.detectDockerfile = vi.fn();
  await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl, dockerfilePath: "backend/Dockerfile" }, deps, db);
  expect(deps.detectDockerfile).not.toHaveBeenCalled();
  expect(deps.build).toHaveBeenCalledWith(path.join(dir, "backend", "Dockerfile"), `scan-${run.id}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

it("지정된 dockerfilePath가 clone 결과에 없으면 build 실패", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-"));
  const run = createRun("https://github.com/owner/repo.git", "git", null, db);
  const deps = baseDeps();
  deps.clone = vi.fn().mockResolvedValue({ dir });
  await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl, dockerfilePath: "nope/Dockerfile" }, deps, db);
  const updated = getRun(run.id, db)!;
  expect(updated.stage).toBe("build");
  expect(updated.status).toBe("failed");
  expect(updated.errorMessage).toMatch(/지정된 Dockerfile을 찾을 수 없습니다/);
  expect(deps.build).not.toHaveBeenCalled();
  fs.rmSync(dir, { recursive: true, force: true });
});
```
(테스트 상단 import에 `fs`, `os`, `path` 추가.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/pipeline/orchestrator.test.ts` → FAIL(RunSource에 dockerfilePath 없음/미사용).

- [ ] **Step 3: 구현**
  - `orchestrator.ts` `RunSource` 교체:
```ts
export type RunSource =
  | { type: "git"; repoUrl: string; dockerfilePath?: string }
  | { type: "local_image"; imageTag: string };
```
  - `dockerfilePath = deps.detectDockerfile(repoDir);` 부분(현재 clone 성공 직후)을 다음으로 교체:
```ts
    if (source.dockerfilePath) {
      const specified = path.join(repoDir, source.dockerfilePath);
      if (!fs.existsSync(specified)) {
        updateRunStage(runId, "build", "failed",
          { errorMessage: `지정된 Dockerfile을 찾을 수 없습니다: ${source.dockerfilePath}` }, db);
        return;
      }
      dockerfilePath = specified;
    } else {
      dockerfilePath = deps.detectDockerfile(repoDir);
      if (!dockerfilePath) {
        updateRunStage(runId, "build", "failed",
          { errorMessage: "Dockerfile을 찾을 수 없습니다 (레포 전체 탐색)" }, db);
        return;
      }
    }
```
    상단 import에 `import fs from "fs";`(없으면). `path`는 직전 작업에서 이미 import됨.
  - `src/app/api/runs/route.ts`의 git run 시작부(`void runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! });`)를 다음으로:
```ts
  void runPipeline(run.id, {
    type: "git",
    repoUrl: asset.repoUrl!,
    ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
  });
```

- [ ] **Step 4: 통과 확인** — orchestrator 테스트 PASS; `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/lib/pipeline/orchestrator.ts src/app/api/runs/route.ts src/lib/pipeline/orchestrator.test.ts && git commit -m "feat: RunSource.dockerfilePath로 지정 Dockerfile 빌드 (#multi-image)"` (+trailer)

---

### Task 4: 프로젝트 fleet 점검에 repo 자산 지원 추가

**Files:**
- Modify: `src/lib/pipeline/serverScan.ts`(fleet 진입점), 필요 시 `src/lib/pipeline/runs.ts` 재사용
- Modify(test): `src/lib/pipeline/serverScan.test.ts`

**Interfaces:**
- Consumes: `createRun`(runs.ts), `runPipeline`(orchestrator), `listAssets`(assets/store), Task 3의 `RunSource.dockerfilePath`.
- Produces: `startProjectFleetScan(projectId, deps?, db?)`가 프로젝트의 **server 자산 + repo 자산 모두**에 대해 run을 만들고 배치에 넣어 실행. 반환 형태(`{ batchId, runIds }`) 불변.

배경: 현재 `startProjectFleetScan`은 `listAssets({ projectId, type: "server" })`만 처리한다. repo 자산도 포함해야 이미지별 일괄 점검이 동작한다.

- [ ] **Step 1: 실패 테스트 작성** — `serverScan.test.ts`에 추가(기존 fleet 테스트의 deps 주입 패턴 따름; repo run은 `runPipeline`를 deps로 주입할 수 있게 해야 함 — 아래 구현이 `deps`에 `runPipeline`을 포함하도록 확장):

```ts
it("프로젝트의 repo 자산에 대해 dockerfilePath를 실은 git run을 만든다", async () => {
  const db = createInMemoryDb();
  const project = createProject({ name: "p" }, db);
  createRepoAsset({ displayName: "backend", repoUrl: "https://github.com/o/r", projectId: project.id, dockerfilePath: "backend/Dockerfile" }, db);
  const runPipelineSpy = vi.fn().mockResolvedValue(undefined);
  const deps = { ...fleetTestDeps(), runPipeline: runPipelineSpy };
  const { runIds } = startProjectFleetScan(project.id, deps, db);
  await flushMicrotasks(); // 기존 테스트가 쓰는 방식으로 백그라운드 완료 대기
  expect(runIds).toHaveLength(1);
  expect(runPipelineSpy).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ type: "git", repoUrl: expect.stringContaining("github.com/o/r"), dockerfilePath: "backend/Dockerfile" }),
    expect.anything(),
    db,
  );
});
```
구현 노트: 기존 `serverScan.test.ts`가 백그라운드 완료를 어떻게 기다리는지(예: `startProjectFleetScan`이 `void runWithConcurrency`라 즉시 반환) 확인하고 동일 방식으로 대기. `ServerScanDeps`에 `runPipeline: typeof runPipeline`를 추가해 주입 가능하게 한다(기본값 = 실제 `runPipeline`). `fleetTestDeps()`는 기존 테스트의 defaultDeps mock 헬퍼 이름에 맞춰 사용(없으면 기존 baseDeps 상당물).

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/pipeline/serverScan.test.ts` → FAIL(repo 자산 미처리).

- [ ] **Step 3: 구현** — `serverScan.ts`:
  - `ServerScanDeps`에 `runPipeline: typeof runPipeline;` 추가, `defaultDeps`에 실제 `runPipeline` 연결(import from orchestrator).
  - `startProjectFleetScan`에서 server 처리에 더해 repo 자산 처리 추가:
```ts
  const repos = listAssets({ projectId, type: "repo" }, db);
  const repoCreated = repos.map((asset) => {
    const run = createRun(asset.repoUrl!, "git", asset.id, db);
    return { run, asset };
  });
  const repoTasks = repoCreated.map(({ run, asset }) => async () => {
    await deps.runPipeline(
      run.id,
      {
        type: "git",
        repoUrl: asset.repoUrl!,
        ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
      },
      undefined, // orchestrator의 기본 PipelineDeps 사용
      db,
    );
  });
```
  `runPipeline` 시그니처는 `runPipeline(runId, source, deps = defaultDeps, db = getDb())`이다(orchestrator.ts). 3번째 인자에 `undefined`를 넘기면 기본 파라미터가 적용되므로 orchestrator의 실제 파이프라인 deps가 쓰인다. 구현 전 orchestrator.ts의 선언을 확인해 인자 순서를 재확인할 것.
  - server task + repo task를 합쳐 `runWithConcurrency([...serverTasks, ...repoTasks], FLEET_SCAN_CONCURRENCY)`로 실행. `runIds`에 server run id + repo run id 모두 포함.
  - `scanProjectFleet`(await 버전)도 동일하게 repo 자산을 포함하도록 대칭 수정(또는 startProjectFleetScan만 쓰이면 그 하나만; 두 함수 모두 있으면 둘 다).

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/pipeline/serverScan.test.ts` → PASS; `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/lib/pipeline/serverScan.ts src/lib/pipeline/serverScan.test.ts && git commit -m "feat: 프로젝트 fleet 점검에 repo 자산 포함 (#multi-image)"` (+trailer)

---

### Task 5: Dockerfile 발견 API (discover)

**Files:**
- Create: `src/app/api/assets/import/discover/route.ts`, `.../discover/route.test.ts`

**Interfaces:**
- Consumes: `cloneRepo`(clone.ts), `listDockerfiles`(Task 2), `requireApiSession`.
- Produces: `POST /api/assets/import/discover` body `{ repoUrl: string }` → `{ dockerfiles: string[] }`(레포 루트 기준 상대경로, 정렬). 임시 클론은 finally로 삭제.

- [ ] **Step 1: 실패 테스트 작성** — clone/listDockerfiles/fs를 모킹해 상대경로 반환·임시 클론 삭제 검증. 라우트는 테스트 용이성을 위해 내부적으로 이 세 가지를 모듈 함수로 사용하되, 테스트는 `vi.mock`으로 `@/lib/pipeline/clone`·`@/lib/pipeline/dockerfile`·`fs`를 모킹. 최소 케이스:
```ts
it("clone 후 Dockerfile 상대경로 목록을 반환하고 임시 클론을 삭제한다", async () => {
  // clone → { dir: "/tmp/x" }, listDockerfiles → ["/tmp/x/backend/Dockerfile","/tmp/x/a/Dockerfile"]
  // 기대 응답: { dockerfiles: ["backend/Dockerfile","a/Dockerfile"] }, fs.rmSync가 "/tmp/x"로 호출
});
it("세션 없으면 401", async () => { /* requireApiSession */ });
```
(정확한 모킹은 sibling route.test.ts 패턴 따름.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/api/assets/import/discover/route.test.ts` → FAIL(라우트 없음).

- [ ] **Step 3: 구현** — `discover/route.ts`:
```ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { requireApiSession } from "@/lib/auth/requireSession";
import { cloneRepo } from "@/lib/pipeline/clone";
import { listDockerfiles } from "@/lib/pipeline/dockerfile";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";

export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
  if (!isValidRepoUrl(repoUrl)) {
    return NextResponse.json({ error: "유효하지 않은 레포 URL입니다" }, { status: 400 });
  }

  const tmpId = `import-${randomUUID()}`;
  let dir: string | undefined;
  try {
    const result = await cloneRepo(repoUrl, tmpId);
    dir = result.dir;
    const abs = listDockerfiles(dir);
    const dockerfiles = abs.map((p) => path.relative(dir!, p));
    return NextResponse.json({ dockerfiles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "레포를 가져오지 못했습니다" },
      { status: 400 },
    );
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: 통과 확인** — discover 테스트 PASS; `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/app/api/assets/import/discover/ && git commit -m "feat: 레포 Dockerfile 발견 API (#multi-image)"` (+trailer)

---

### Task 6: 가져오기 생성 API (create)

**Files:**
- Create: `src/app/api/assets/import/create/route.ts`, `.../create/route.test.ts`

**Interfaces:**
- Consumes: `createProject`(projects/store), `createRepoAsset`/`DuplicateAssetError`(assets/store), `requireApiSession`.
- Produces: `POST /api/assets/import/create` body `{ repoUrl: string, projectName: string, dockerfilePaths: string[] }` → `{ projectId: string, created: number, skipped: string[] }`(201). 빈 선택/URL/프로젝트명 누락 → 400.

- [ ] **Step 1: 실패 테스트 작성** — in-memory db로 프로젝트+자산 생성, 중복 skip 보고, 검증 오류 케이스. 예:
```ts
it("프로젝트와 이미지당 자산을 만들고 중복은 skip으로 보고한다", async () => {
  // dockerfilePaths: ["backend/Dockerfile","frontend/Dockerfile"] → created:2
  // 같은 걸 다시 create → skipped 포함
});
it("빈 선택은 400", async () => {});
it("세션 없으면 401", async () => {});
```
(라우트가 db를 주입받게 하거나, 테스트에서 실제 in-memory db를 쓰는 기존 API 테스트 패턴 따름.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/api/assets/import/create/route.test.ts` → FAIL.

- [ ] **Step 3: 구현** — `create/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { createProject } from "@/lib/projects/store";
import { createRepoAsset, DuplicateAssetError } from "@/lib/assets/store";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";

function repoName(repoUrl: string): string {
  const last = repoUrl.replace(/\.git$/, "").split("/").filter(Boolean).pop() ?? "repo";
  return last;
}

export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
  const projectName = typeof body?.projectName === "string" ? body.projectName.trim() : "";
  const dockerfilePaths: string[] = Array.isArray(body?.dockerfilePaths)
    ? body.dockerfilePaths.filter((p: unknown): p is string => typeof p === "string" && p.trim() !== "")
    : [];

  if (!isValidRepoUrl(repoUrl)) return NextResponse.json({ error: "유효하지 않은 레포 URL입니다" }, { status: 400 });
  if (!projectName) return NextResponse.json({ error: "프로젝트명을 입력하세요" }, { status: 400 });
  if (dockerfilePaths.length === 0) return NextResponse.json({ error: "이미지를 하나 이상 선택하세요" }, { status: 400 });

  const project = createProject({ name: projectName });
  const name = repoName(repoUrl);
  let created = 0;
  const skipped: string[] = [];
  for (const dfPath of dockerfilePaths) {
    try {
      createRepoAsset({ displayName: `${name} / ${dfPath}`, repoUrl, projectId: project.id, dockerfilePath: dfPath });
      created++;
    } catch (err) {
      if (err instanceof DuplicateAssetError) { skipped.push(dfPath); continue; }
      throw err;
    }
  }
  return NextResponse.json({ projectId: project.id, created, skipped }, { status: 201 });
}
```
주의: `createProject`의 정확한 input 형태(`{ name }` 여부)를 projects/store에서 확인해 맞춘다.

- [ ] **Step 4: 통과 확인** — create 테스트 PASS; `npm test`; eslint·tsc clean.

- [ ] **Step 5: Commit** — `git add src/app/api/assets/import/create/ && git commit -m "feat: 레포 가져오기 생성 API — 프로젝트+이미지별 자산 (#multi-image)"` (+trailer)

---

### Task 7: 가져오기 UI 페이지 (`/assets/import`)

**Files:**
- Create: `src/app/assets/import/page.tsx`, `src/app/assets/import/ImportForm.tsx`(client)
- Modify: `src/app/assets/page.tsx`(가져오기 진입 링크 추가)

**Interfaces:**
- Consumes: discover(Task 5)·create(Task 6) API.

UI 전용 태스크 — 기존 Kinetic 레시피와 sibling 페이지(`src/app/assets/new/AssetForm.tsx`, `ProjectForm.tsx`)를 house-style로 따른다. 로직 계약만 정확히 지키면 됨.

- [ ] **Step 1: 구현** — `ImportForm.tsx`(client component):
  - 상태: `repoUrl`, `discovering`, `dockerfiles: string[] | null`, `selected: Set<string>`, `projectName`, `creating`, `error`.
  - 1단계: 레포 URL 입력(입력 필드 레시피 + 라벨 상단) + "발견" Primary 버튼 → `POST /api/assets/import/discover` `{ repoUrl }`. 성공 시 `dockerfiles` 세팅(기본 전체선택), 실패 시 error 표시. 발견 중 로딩 표시.
  - 2단계(`dockerfiles !== null`): 전체선택 토글 + 각 경로 체크박스(경로 `font-mono text-[13px]`), 프로젝트명 입력(기본값 = repo 이름 파생), "가져오기" Primary 버튼 → `POST /api/assets/import/create` `{ repoUrl, projectName, dockerfilePaths: [...selected] }`. 성공 시 `router.push(\`/projects/${projectId}\`)`. 0개 선택 시 버튼 비활성.
  - 컨테이너/타이틀은 페이지 레시피. Card로 각 단계 감싸기.
  - `#77`의 디바운스 패턴은 불필요(명시적 버튼 트리거).
- `page.tsx`(server): 타이틀 "레포 가져오기" + `<ImportForm />`.
- `src/app/assets/page.tsx`: 상단 액션에 "레포 가져오기"(→ `/assets/import`) Secondary 링크 버튼 추가(기존 등록/업로드 버튼 옆).

- [ ] **Step 2: 검증** — `npm test` 전체 PASS(기존)·`npx eslint src/app/assets/`·`npx tsc --noEmit` clean. dev 서버(localhost:3000, 인증 세션 쿠키 필요)에서 `/assets/import` 렌더 확인(가능하면 discover까지 curl/브라우저로 스모크). 실제 clone 스모크는 docker 불필요(discover는 clone+list만) — 시간 되면 ocpm URL로 발견 목록이 뜨는지 확인.

- [ ] **Step 3: Commit** — `git add src/app/assets/import/ src/app/assets/page.tsx && git commit -m "feat: 레포 가져오기 UI — 발견·선택·프로젝트 생성 (#multi-image)"` (+trailer)

---

## 최종 검증 + 머지

- [ ] `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 PASS
- [ ] `npm run lint`·`npx tsc --noEmit`·`npm run build` clean
- [ ] dev 서버 스모크: `/assets/import`에서 ocpm URL → 발견(~28개) → 일부 선택 → 프로젝트 생성 → `/projects/[id]`에서 이미지별 repo 자산 확인 → FleetScanButton으로 일괄 점검이 이미지별 git run을 만드는지 확인(docker 가용 시 backend/Dockerfile run이 build까지 진행).
- [ ] whole-branch 리뷰 통과 후 main 머지·푸시(사용자 확인).
