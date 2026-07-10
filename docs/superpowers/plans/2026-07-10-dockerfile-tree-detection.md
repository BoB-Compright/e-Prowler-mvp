# Dockerfile 트리 탐색 + 하위경로 빌드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** git 레포 점검 파이프라인이 루트뿐 아니라 레포 트리 전체에서 Dockerfile을 찾아 하위경로 Dockerfile로도 이미지를 빌드하게 한다.

**Architecture:** `detectDockerfile`을 루트 단일 확인에서 트리 재귀 탐색+결정적 자동 선택으로 재작성하고, `buildImage`에 `-f <dockerfilePath>` 인자를 추가(컨텍스트는 레포 루트 유지)하며, `orchestrator`가 선택된 Dockerfile 경로를 build에 넘기고 결과 메시지에 노출한다.

**Tech Stack:** TypeScript, Node fs, `docker build`, vitest. 실행 Node 버전은 v20+ (테스트는 `nvm use v24.16.0`).

**Spec:** `docs/superpowers/specs/2026-07-10-dockerfile-tree-detection-design.md`

## Global Constraints

- 기존 루트 Dockerfile 케이스의 동작·빌드 컨텍스트(=레포 루트)를 100% 보존한다. 순수 파이프라인 동작 개선.
- `local_image` 소스 경로는 Dockerfile 탐색/빌드를 건너뛰므로 절대 건드리지 않는다.
- 매칭(파일명, 대소문자 무시): 정확히 `Dockerfile` / `Dockerfile.<suffix>` / `<prefix>.Dockerfile`.
- 제외 디렉터리(트리 진입 금지): `.git`, `node_modules`, `vendor`, `.next`, `dist`, `build`.
- 탐색 상한: 최대 깊이 8, 최대 방문 엔트리 20000. 심볼릭 링크 디렉터리는 따라가지 않음. `readdir` 실패 디렉터리는 건너뜀.
- 자동 선택 순위: ① 깊이 얕은 것 우선(루트=0) → ② 같은 깊이면 정확한 이름 `Dockerfile` 우선 → ③ 그래도 동률이면 경로 사전순.
- 빌드 컨텍스트는 레포 루트(`repoDir`) 유지. 변경은 `-f <dockerfilePath>` 인자 추가뿐.
- 검증: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 통과(현재 672 + 신규), `npx eslint <파일>` / `npx tsc --noEmit` clean.
- 커밋: 한국어 conventional commit, 말미 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `detectDockerfile` 트리 탐색 재작성

**Files:**
- Modify: `src/lib/pipeline/dockerfile.ts` (전체 교체)
- Modify: `src/lib/pipeline/dockerfile.test.ts` (케이스 추가)

**Interfaces:**
- Produces: `detectDockerfile(repoDir: string): string | undefined` — 선택된 Dockerfile **절대 경로**, 후보 없으면 `undefined`. (시그니처 불변, 동작만 확장.)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/pipeline/dockerfile.test.ts`의 기존 `describe("detectDockerfile", ...)` 블록 안(32행 `});` 앞)에 아래 케이스를 추가한다:

```ts
  it("finds a Dockerfile in a subdirectory", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "docker"));
    fs.writeFileSync(path.join(dir, "docker", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "docker", "Dockerfile"));
  });

  it("finds a variant name like Dockerfile.prod", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "Dockerfile.prod"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "Dockerfile.prod"));
  });

  it("prefers the root Dockerfile over a deeper one", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "Dockerfile"));
  });

  it("prefers the exact name Dockerfile over a variant at the same depth", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "a"));
    fs.mkdirSync(path.join(dir, "b"));
    fs.writeFileSync(path.join(dir, "b", "Dockerfile.dev"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "a", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "a", "Dockerfile"));
  });

  it("breaks remaining ties by lexicographic path", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "z"));
    fs.mkdirSync(path.join(dir, "a"));
    fs.writeFileSync(path.join(dir, "z", "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(dir, "a", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBe(path.join(dir, "a", "Dockerfile"));
  });

  it("ignores Dockerfiles inside excluded directories", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "Dockerfile"), "FROM scratch\n");
    expect(detectDockerfile(dir)).toBeUndefined();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npx vitest run src/lib/pipeline/dockerfile.test.ts`
Expected: FAIL — 하위경로/변형명/제외디렉터리 케이스가 현재 루트-only 구현에서 통과하지 못함.

- [ ] **Step 3: 구현**

`src/lib/pipeline/dockerfile.ts` 전체를 아래로 교체:

```ts
import fs from "fs";
import path from "path";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "vendor", ".next", "dist", "build"]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 20000;

// 파일명이 Dockerfile / Dockerfile.<suffix> / <prefix>.Dockerfile 인지 (대소문자 무시).
function isDockerfileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "dockerfile" || lower.startsWith("dockerfile.") || lower.endsWith(".dockerfile");
}

interface Candidate {
  absPath: string;
  depth: number;
  exact: boolean; // 파일명이 정확히 "Dockerfile"(대소문자 무시)인가
}

// 레포 트리를 재귀 탐색해 Dockerfile류 후보를 전부 수집하고, 결정적 순위로 하나를 고른다.
// 순위: 얕은 깊이 → 정확한 이름 우선 → 경로 사전순.
export function detectDockerfile(repoDir: string): string | undefined {
  const candidates: Candidate[] = [];
  let visited = 0;

  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH || visited >= MAX_ENTRIES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 권한 오류 등은 해당 디렉터리만 건너뜀
    }
    for (const entry of entries) {
      if (visited >= MAX_ENTRIES) return;
      visited++;
      if (entry.isSymbolicLink()) continue; // 심링크는 따라가지 않음(루프 방지)
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && isDockerfileName(entry.name)) {
        candidates.push({
          absPath: path.join(dir, entry.name),
          depth,
          exact: entry.name.toLowerCase() === "dockerfile",
        });
      }
    }
  }

  walk(repoDir, 0);
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return a.absPath < b.absPath ? -1 : a.absPath > b.absPath ? 1 : 0;
  });
  return candidates[0].absPath;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npx vitest run src/lib/pipeline/dockerfile.test.ts` → PASS (8 케이스)
Run: `npx eslint src/lib/pipeline/dockerfile.ts src/lib/pipeline/dockerfile.test.ts` → clean
Run: `npx tsc --noEmit` → clean

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/dockerfile.ts src/lib/pipeline/dockerfile.test.ts
git commit -m "feat: Dockerfile을 레포 트리 전체에서 탐색·자동 선택

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `buildImage`에 `-f <dockerfilePath>` 추가

**Files:**
- Modify: `src/lib/pipeline/build.ts:6-11` (`buildImage` 시그니처·명령)
- Create: `src/lib/pipeline/build.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: `buildImage(repoDir: string, dockerfilePath: string, imageTag: string): Promise<void>` — `docker build -t <imageTag> -f <dockerfilePath> <repoDir>` 실행. `removeImage`는 불변.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/pipeline/build.ts`는 모듈 스코프에서 `child_process.execFile`을 `promisify`로 감싸 사용한다. `vi.mock`으로 `child_process`를 모킹해 인자를 검증한다. `src/lib/pipeline/build.test.ts` 생성:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const execFileMock = vi.fn(
  (_cmd: string, _args: string[], _opts: unknown, cb: (err: unknown) => void) => cb(null),
);

vi.mock("child_process", () => ({
  execFile: (cmd: string, args: string[], opts: unknown, cb: (err: unknown) => void) =>
    execFileMock(cmd, args, opts, cb),
}));

describe("buildImage", () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it("runs docker build with -f pointing at the given Dockerfile and repoDir as context", async () => {
    const { buildImage } = await import("./build");
    await buildImage("/repo", "/repo/docker/Dockerfile", "scan-123");

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileMock.mock.calls[0];
    expect(cmd).toBe("docker");
    expect(args).toEqual(["build", "-t", "scan-123", "-f", "/repo/docker/Dockerfile", "/repo"]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npx vitest run src/lib/pipeline/build.test.ts`
Expected: FAIL — 현재 `buildImage`는 인자 2개(`repoDir, imageTag`)이고 명령에 `-f`가 없어 `args` 불일치(또는 타입 에러).

- [ ] **Step 3: 구현**

`src/lib/pipeline/build.ts`의 `buildImage` 함수(6~11행)를 아래로 교체 (`removeImage` 및 그 주석은 그대로 둔다):

```ts
export async function buildImage(
  repoDir: string,
  dockerfilePath: string,
  imageTag: string,
): Promise<void> {
  // 컨텍스트는 레포 루트(repoDir) 유지, Dockerfile 위치만 -f 로 지정.
  await execFileAsync("docker", ["build", "-t", imageTag, "-f", dockerfilePath, repoDir], {
    timeout: 300_000,
    maxBuffer: 1024 * 1024 * 10,
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npx vitest run src/lib/pipeline/build.test.ts` → PASS
Run: `npx tsc --noEmit` → 이 시점엔 orchestrator.ts가 아직 2-인자 호출이라 **타입 에러가 예상됨** — 그것이 Task 3의 신호다. build.test.ts와 build.ts 자체에 대한 `npx eslint src/lib/pipeline/build.ts src/lib/pipeline/build.test.ts`만 clean 확인.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/build.ts src/lib/pipeline/build.test.ts
git commit -m "feat: buildImage가 -f로 임의 경로 Dockerfile을 빌드

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `orchestrator` 연결 — 하위경로 전달 + 결과 노출 + 실패 문구

**Files:**
- Modify: `src/lib/pipeline/orchestrator.ts` (import에 `path` 추가, 100~122행 build 블록)
- Modify: `src/lib/pipeline/orchestrator.test.ts` (build 인자·성공 메시지·실패 문구 케이스)

**Interfaces:**
- Consumes: `detectDockerfile(repoDir): string | undefined` (Task 1), `buildImage(repoDir, dockerfilePath, imageTag)` (Task 2). `PipelineDeps.build`는 `typeof buildImage`라 자동으로 새 시그니처를 요구한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/pipeline/orchestrator.test.ts`에 케이스 두 개를 추가한다. 먼저 기존 "no Dockerfile" 테스트(99~111행)의 문구 단언은 정규식(`/Dockerfile/`)이라 그대로 통과하므로 손대지 않는다. 아래를 `describe("runPipeline", ...)` 블록 안(마지막 `it` 뒤)에 추가:

```ts
  it("builds using a Dockerfile found in a subdirectory and records its relative path", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" });
    deps.detectDockerfile = vi.fn().mockReturnValue("/tmp/fake-repo/docker/Dockerfile");

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("succeeded");
    // build 는 (repoDir, dockerfilePath, imageTag) 로 호출된다.
    expect(deps.build).toHaveBeenCalledWith(
      "/tmp/fake-repo",
      "/tmp/fake-repo/docker/Dockerfile",
      `scan-${run.id}`,
    );
    // runChecks 는 선택된 Dockerfile 경로를 받는다.
    expect(deps.runChecks).toHaveBeenCalledWith(
      "/tmp/fake-repo/docker/Dockerfile",
      `scan-${run.id}`,
    );
  });
```

또한 기존 "runs the full pipeline ..." 테스트(35~67행)에서 `deps.detectDockerfile` 기본값이 `/tmp/fake-repo/Dockerfile`(루트)이므로, build 호출 단언을 추가로 넣어 회귀를 막는다. 46행 `expect(deps.runChecks)...` 바로 위에 추가:

```ts
    expect(deps.build).toHaveBeenCalledWith(
      "/tmp/fake-repo",
      "/tmp/fake-repo/Dockerfile",
      `scan-${run.id}`,
    );
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npx vitest run src/lib/pipeline/orchestrator.test.ts`
Expected: FAIL — 현재 orchestrator는 `deps.build(repoDir, imageTag)` 2-인자로 호출하므로 3-인자 단언 불일치.

- [ ] **Step 3: 구현**

`src/lib/pipeline/orchestrator.ts` 상단 import에 `path`를 추가한다(1행 `import type { Database }...` 위 또는 기존 import 그룹에):

```ts
import path from "path";
```

그리고 build 블록(현재 112~122행)을 아래로 교체:

```ts
    updateRunStage(runId, "build", "running", {}, db);
    imageTag = `scan-${runId}`;
    try {
      await deps.build(repoDir, dockerfilePath, imageTag);
    } catch (err) {
      if (isCancelled(runId, db)) return;
      updateRunStage(runId, "build", "failed", { errorMessage: errorMessage(err) }, db);
      return;
    }
    if (isCancelled(runId, db)) return;
    updateRunStage(
      runId,
      "build",
      "succeeded",
      { imageTag, message: `Dockerfile: ${path.relative(repoDir, dockerfilePath)}` },
      db,
    );
```

그리고 "Dockerfile 없음" 실패 문구(현재 106행)를 갱신:

```ts
        { errorMessage: "Dockerfile을 찾을 수 없습니다 (레포 전체 탐색)" },
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npx vitest run src/lib/pipeline/orchestrator.test.ts` → PASS
Run: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` → 전체 PASS (672 + 신규)
Run: `npx eslint src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts` → clean
Run: `npx tsc --noEmit` → clean (이제 build 호출이 3-인자라 Task 2의 타입 에러 해소)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts
git commit -m "feat: 하위경로 Dockerfile을 빌드에 전달하고 선택 경로를 결과에 노출

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 최종 검증

- [ ] `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` → 전체 PASS
- [ ] `npm run lint` → 에러 없음 / `npx tsc --noEmit` → clean
- [ ] (선택, docker 사용 가능 환경) dev 서버에서 하위경로 Dockerfile 레포(예: `github.com/blueskytto/ocpm`)를 재점검해 build 단계가 통과하고 진행/리포트 화면에 `Dockerfile: <상대경로>`가 표시되는지 확인. docker 미가용 환경이면 이 항목은 생략하고 그 사실을 보고.
