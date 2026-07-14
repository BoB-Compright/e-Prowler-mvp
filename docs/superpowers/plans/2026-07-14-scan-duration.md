# 점검 소요시간 기록·표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 점검 파이프라인의 실제 가동 소요시간(큐 대기 제외)을 초 단위로 기록하고 점검 이력·상세·배치 화면에 한국어 단위로 표시한다(진행 중은 라이브 타이머).

**Architecture:** `runs` 테이블에 `started_at`/`finished_at`을 신설한다. `started_at`은 파이프라인이 실제로 실행을 시작하는 함수 최상단에서, `finished_at`은 종료 전이에서 idempotent하게 기록한다. 표시 값은 순수 함수 `computeDurationSeconds` + `formatDuration`으로 파생하고, 클라이언트 컴포넌트 `<RunDuration>`이 진행 중엔 1초마다 갱신한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest, Tailwind v4.

## Global Constraints

- 테스트/타입/린트는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 저장은 UTC ISO 문자열(`new Date().toISOString()`), 표시만 변환(기존 `formatKst` 원칙과 동일).
- `started_at`은 `createRun`(배치 enqueue 시점)이 아니라 파이프라인 실제 실행 시작 지점에서 기록 — 동시성 큐 대기시간 제외.
- `markRunStarted`/`markRunFinished`는 `... IS NULL` 가드로 **첫 값만** 유지(idempotent, 덮어쓰지 않음).
- 표시 형식(한국어 단위): `43초` / `2분 07초`(분 있으면 초 2자리 패딩, 초=0이면 `2분`) / `1시간 5분`(시간 있으면 초 생략, 분=0이면 `1시간`).
- 음수 소요시간은 0으로 클램프.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: DB 컬럼 + Run 타입 + 스토어(기록·종료 스탬프)

**Files:**
- Modify: `src/lib/db/index.ts` (runs CREATE TABLE + migrate)
- Modify: `src/lib/pipeline/types.ts` (Run 인터페이스)
- Modify: `src/lib/pipeline/runs.ts` (RunRow, toRun, createRun, updateRunStage, cancelRun, 신규 markRunStarted/markRunFinished)
- Test: `src/lib/pipeline/runs.test.ts`

**Interfaces:**
- Produces:
  - `Run.startedAt: string | null`, `Run.finishedAt: string | null`
  - `markRunStarted(runId: string, db?: Database): void`
  - `markRunFinished(runId: string, db?: Database): void`

- [ ] **Step 1: Run 인터페이스에 필드 추가**

`src/lib/pipeline/types.ts`의 `Run` 인터페이스(35~49행)에서 `updatedAt: string;` 다음 줄에 추가:

```ts
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
```

- [ ] **Step 2: 스키마 CREATE TABLE에 컬럼 추가**

`src/lib/db/index.ts`의 `CREATE TABLE IF NOT EXISTS runs (...)` 블록(6~17행)에서 `updated_at TEXT NOT NULL` 다음에 두 컬럼을 추가한다(신규 DB용):

```sql
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'git',
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  image_tag TEXT,
  container_name TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
```

- [ ] **Step 3: migrate에 가드된 ALTER 추가**

`src/lib/db/index.ts`의 `migrate` 함수 안, `runColumns` 검사 블록(181~193행) 끝(`trigger_type` 추가 직후)에 이어서 추가:

```ts
  if (!runColumns.some((column) => column.name === "started_at")) {
    db.exec(`ALTER TABLE runs ADD COLUMN started_at TEXT`);
  }
  if (!runColumns.some((column) => column.name === "finished_at")) {
    db.exec(`ALTER TABLE runs ADD COLUMN finished_at TEXT`);
  }
```

- [ ] **Step 4: 실패하는 테스트 작성**

`src/lib/pipeline/runs.test.ts`에 아래 테스트를 추가한다(기존 import에 필요한 심볼이 없으면 상단 import에 `markRunStarted, markRunFinished`를 추가; `createRun, updateRunStage, cancelRun, getRun`은 이미 있음).

```ts
import { markRunStarted, markRunFinished } from "./runs";

describe("run duration timestamps", () => {
  it("createRun은 started_at/finished_at을 null로 둔다 (큐 대기 제외)", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    const row = getRun(run.id, db)!;
    expect(row.startedAt).toBeNull();
    expect(row.finishedAt).toBeNull();
  });

  it("markRunStarted는 첫 값만 기록(idempotent)", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    markRunStarted(run.id, db);
    const first = getRun(run.id, db)!.startedAt;
    expect(first).not.toBeNull();
    markRunStarted(run.id, db);
    expect(getRun(run.id, db)!.startedAt).toBe(first);
  });

  it("종료 전이(done/succeeded)에서 finished_at 기록", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    expect(getRun(run.id, db)!.finishedAt).toBeNull();
    updateRunStage(run.id, "done", "succeeded", {}, db);
    expect(getRun(run.id, db)!.finishedAt).not.toBeNull();
  });

  it("실패 전이에서도 finished_at 기록", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    updateRunStage(run.id, "build", "failed", { errorMessage: "boom" }, db);
    expect(getRun(run.id, db)!.finishedAt).not.toBeNull();
  });

  it("markRunFinished는 첫 값만 기록(idempotent)", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    markRunFinished(run.id, db);
    const first = getRun(run.id, db)!.finishedAt;
    updateRunStage(run.id, "done", "succeeded", {}, db);
    expect(getRun(run.id, db)!.finishedAt).toBe(first);
  });

  it("cancelRun은 finished_at 기록", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    cancelRun(run.id, "사용자 취소", db);
    expect(getRun(run.id, db)!.finishedAt).not.toBeNull();
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/runs.test.ts`
Expected: FAIL — `markRunStarted`/`markRunFinished` 미정의, `startedAt`/`finishedAt` undefined.

- [ ] **Step 6: RunRow·toRun·createRun 수정**

`src/lib/pipeline/runs.ts`:

`RunRow` 인터페이스(6~20행)에 `updated_at: string;` 다음 줄 추가:
```ts
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}
```

`toRun`(22~38행)의 반환 객체에서 `updatedAt: row.updated_at,` 다음 줄 추가:
```ts
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
```

`createRun`(43~71행): `run` 객체 리터럴에 `updatedAt: now,` 다음 줄 `startedAt: null,` 와 `finishedAt: null,` 추가하고, INSERT 문의 컬럼·VALUES에 두 컬럼을 넣는다:
```ts
  const run: Run = {
    id: randomUUID(),
    repoUrl: source,
    sourceType,
    stage: "clone",
    status: "running",
    imageTag: null,
    containerName: null,
    errorMessage: null,
    assetId,
    batchId: null,
    triggerType: "manual",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
  db.prepare(
    `INSERT INTO runs (id, repo_url, source_type, stage, status, image_tag, container_name, error_message, asset_id, created_at, updated_at, started_at, finished_at)
     VALUES (@id, @repoUrl, @sourceType, @stage, @status, @imageTag, @containerName, @errorMessage, @assetId, @createdAt, @updatedAt, @startedAt, @finishedAt)`,
  ).run(run);
```

- [ ] **Step 7: markRunStarted/markRunFinished 추가 + 종료 스탬프 배선**

`src/lib/pipeline/runs.ts`에 두 헬퍼를 추가한다(파일 하단, 다른 export 함수들 옆):

```ts
// 파이프라인이 실제로 실행을 시작하는 순간 호출 — 배치 큐 대기시간을 제외하려고
// createRun(enqueue)이 아니라 여기서 찍는다. 이미 값이 있으면 덮어쓰지 않는다.
export function markRunStarted(runId: string, db: Database = getDb()): void {
  db.prepare(`UPDATE runs SET started_at = @now WHERE id = @id AND started_at IS NULL`).run({
    id: runId,
    now: new Date().toISOString(),
  });
}

// 파이프라인 종료 순간 호출 — 첫 종료가 확정값(idempotent).
export function markRunFinished(runId: string, db: Database = getDb()): void {
  db.prepare(`UPDATE runs SET finished_at = @now WHERE id = @id AND finished_at IS NULL`).run({
    id: runId,
    now: new Date().toISOString(),
  });
}
```

`updateRunStage`(73~102행)의 `appendEvent(...)` 호출 바로 다음(함수 끝, 101행 직후)에 종료 전이 스탬프를 추가한다:
```ts
  appendEvent(runId, stage, status, extra.message ?? extra.errorMessage ?? null, db);
  // 종료 전이(파이프라인의 정상 완료 "done/succeeded" 또는 어떤 단계든 "failed")에서 종료 시각을 확정.
  if (status === "failed" || (stage === "done" && status === "succeeded")) {
    markRunFinished(runId, db);
  }
}
```

`cancelRun`(155~168행)의 `appendEvent(...)` 호출 바로 다음, `return` 직전에 추가:
```ts
  appendEvent(runId, run.stage, "cancelled", message, db);
  markRunFinished(runId, db);
  return getRun(runId, db)!;
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/runs.test.ts`
Expected: PASS (신규 6개 + 기존 전부).

- [ ] **Step 9: 커밋**

```bash
git add src/lib/db/index.ts src/lib/pipeline/types.ts src/lib/pipeline/runs.ts src/lib/pipeline/runs.test.ts
git commit -m "feat: runs에 started_at/finished_at 기록(큐 대기 제외·idempotent)"
```

---

### Task 2: 파이프라인 실행 시작 스탬프 배선

**Files:**
- Modify: `src/lib/pipeline/orchestrator.ts` (runPipeline 최상단)
- Modify: `src/lib/pipeline/serverScan.ts` (runServerScanPipeline 최상단)
- Test: `src/lib/pipeline/orchestrator.test.ts`, `src/lib/pipeline/serverScan.test.ts`

**Interfaces:**
- Consumes: `markRunStarted(runId, db)` (Task 1)

- [ ] **Step 1: 실패하는 테스트 작성 (repo)**

`src/lib/pipeline/orchestrator.test.ts`의 `describe("runPipeline", …)` 안에 추가(기존 harness `baseDeps()`/`createRun`/`getRun`/`db` 사용, 42행 예시와 동일한 호출 형태):

```ts
  it("파이프라인 실행 시작 시 started_at을 기록한다", async () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    expect(getRun(run.id, db)!.startedAt).toBeNull();
    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, baseDeps(), db);
    const updated = getRun(run.id, db)!;
    expect(updated.startedAt).not.toBeNull();
    expect(updated.finishedAt).not.toBeNull();
  });
```

- [ ] **Step 2: 실패하는 테스트 작성 (server)**

`src/lib/pipeline/serverScan.test.ts`의 `describe("scanServerAsset", …)` 안에 추가한다. 자산 생성은 이 파일의 기존 테스트와 동일하게 `createServerAsset(serverAssetInput(), db)`를 쓴다(둘 다 이미 import/정의돼 있음):

```ts
  it("서버 파이프라인 실행 시 started_at/finished_at을 기록한다", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const deps = baseDeps();
    const runId = await scanServerAsset(asset.id, null, deps, db);
    const run = getRun(runId, db)!;
    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/orchestrator.test.ts src/lib/pipeline/serverScan.test.ts`
Expected: FAIL — `startedAt`이 null로 남아 assertion 실패.

- [ ] **Step 4: runPipeline에 스탬프 추가**

`src/lib/pipeline/orchestrator.ts`: `markRunStarted`를 import에 추가하고(11행의 `import { isCancelled, updateRunStage } from "./runs";` → `import { isCancelled, markRunStarted, updateRunStage } from "./runs";`), 함수 본문 최상단(77행 `let imageTag: string;` 바로 앞)에 추가:

```ts
export async function runPipeline(
  runId: string,
  source: RunSource,
  deps: PipelineDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  markRunStarted(runId, db);
  let imageTag: string;
```

- [ ] **Step 5: runServerScanPipeline에 스탬프 추가**

`src/lib/pipeline/serverScan.ts`: import에 `markRunStarted` 추가(11행 `import { createRun, isCancelled, updateRunStage } from "@/lib/pipeline/runs";` → `import { createRun, isCancelled, markRunStarted, updateRunStage } from "@/lib/pipeline/runs";`), 함수 본문 최상단(107행 `updateRunStage(run.id, "connect", "running", {}, db);` 바로 앞)에 추가:

```ts
): Promise<void> {
  markRunStarted(run.id, db);
  updateRunStage(run.id, "connect", "running", {}, db);
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/orchestrator.test.ts src/lib/pipeline/serverScan.test.ts`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/pipeline/orchestrator.ts src/lib/pipeline/serverScan.ts src/lib/pipeline/orchestrator.test.ts src/lib/pipeline/serverScan.test.ts
git commit -m "feat: 파이프라인 실제 실행 시작 시 started_at 기록(큐 대기 제외)"
```

---

### Task 3: 소요시간 파생·포맷 유틸

**Files:**
- Create: `src/lib/time/duration.ts`
- Test: `src/lib/time/duration.test.ts`

**Interfaces:**
- Consumes: `Run` 타입 필드 `startedAt`/`finishedAt`/`createdAt`/`updatedAt`/`status` (Task 1)
- Produces:
  - `formatDuration(seconds: number): string`
  - `type DurationView = { kind: "done" | "running" | "approx"; seconds: number } | { kind: "pending" }`
  - `computeDurationSeconds(run: DurationInput, nowMs: number): DurationView`
  - `interface DurationInput { status: RunStatus; startedAt: string | null; finishedAt: string | null; createdAt: string; updatedAt: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/time/duration.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";
import { formatDuration, computeDurationSeconds } from "./duration";

describe("formatDuration", () => {
  it.each([
    [0, "0초"],
    [1, "1초"],
    [59, "59초"],
    [60, "1분"],
    [61, "1분 01초"],
    [125, "2분 05초"],
    [3599, "59분 59초"],
    [3600, "1시간"],
    [3661, "1시간 1분"],
    [7325, "2시간 2분"],
  ])("%i초 → %s", (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected);
  });
});

describe("computeDurationSeconds", () => {
  const base = {
    status: "succeeded" as const,
    startedAt: "2026-07-14T00:00:00.000Z",
    finishedAt: "2026-07-14T00:00:12.000Z",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:12.000Z",
  };
  it("종료(finished 있음) → done + 확정 초", () => {
    expect(computeDurationSeconds(base, Date.parse("2026-07-14T01:00:00Z"))).toEqual({ kind: "done", seconds: 12 });
  });
  it("진행 중(started 있고 finished 없음) → running + now-started", () => {
    const r = { ...base, status: "running" as const, finishedAt: null };
    expect(computeDurationSeconds(r, Date.parse("2026-07-14T00:00:30Z"))).toEqual({ kind: "running", seconds: 30 });
  });
  it("대기 중(started/finished 모두 없음, running) → pending", () => {
    const r = { ...base, status: "running" as const, startedAt: null, finishedAt: null };
    expect(computeDurationSeconds(r, Date.parse("2026-07-14T00:00:30Z"))).toEqual({ kind: "pending" });
  });
  it("과거 이력(종료지만 started/finished 없음) → approx + updated-created", () => {
    const r = { ...base, status: "succeeded" as const, startedAt: null, finishedAt: null };
    expect(computeDurationSeconds(r, Date.parse("2026-07-14T01:00:00Z"))).toEqual({ kind: "approx", seconds: 12 });
  });
  it("시계 역전은 0으로 클램프", () => {
    const r = { ...base, status: "running" as const, finishedAt: null, startedAt: "2026-07-14T00:00:30.000Z" };
    expect(computeDurationSeconds(r, Date.parse("2026-07-14T00:00:00Z"))).toEqual({ kind: "running", seconds: 0 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/time/duration.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 유틸 구현**

`src/lib/time/duration.ts` 생성:

```ts
import type { RunStatus } from "@/lib/pipeline/types";

export interface DurationInput {
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DurationView =
  | { kind: "done" | "running" | "approx"; seconds: number }
  | { kind: "pending" };

function diffSeconds(fromIso: string, toMs: number): number {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.floor((toMs - from) / 1000));
}

// 표시할 소요시간을 파생한다(저장값은 건드리지 않음). 큐 대기시간은 started_at 기준이라 자연히 제외된다.
export function computeDurationSeconds(run: DurationInput, nowMs: number): DurationView {
  if (run.startedAt && run.finishedAt) {
    return { kind: "done", seconds: diffSeconds(run.startedAt, Date.parse(run.finishedAt)) };
  }
  if (run.startedAt && !run.finishedAt) {
    return { kind: "running", seconds: diffSeconds(run.startedAt, nowMs) };
  }
  // started_at이 없다: 아직 실행 전(대기) 이거나, 이 기능 배포 전의 과거 이력.
  if (run.status === "running") {
    return { kind: "pending" };
  }
  return { kind: "approx", seconds: diffSeconds(run.createdAt, Date.parse(run.updatedAt)) };
}

// 한국어 단위. 43초 / 2분 07초(분 있으면 초 2자리, 초=0이면 "2분") / 1시간 5분(시간 있으면 초 생략, 분=0이면 "1시간").
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total}초`;
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s === 0 ? `${m}분` : `${m}분 ${String(s).padStart(2, "0")}초`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/time/duration.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/time/duration.ts src/lib/time/duration.test.ts
git commit -m "feat: 소요시간 파생(computeDurationSeconds)·한국어 포맷(formatDuration)"
```

---

### Task 4: `<RunDuration>` 컴포넌트 + 이력·상세·배치 표시

**Files:**
- Create: `src/app/_components/RunDuration.tsx`
- Modify: `src/app/runs/page.tsx` (이력 목록 컬럼)
- Modify: `src/app/runs/[id]/RunStatus.tsx` (상세 표시)
- Modify: `src/app/runs/batch/[batchId]/page.tsx` (배치 목록 컬럼)

**Interfaces:**
- Consumes: `computeDurationSeconds`, `formatDuration` (Task 3); `Run.startedAt`/`finishedAt` (Task 1).

- [ ] **Step 1: RunDuration 클라이언트 컴포넌트 생성**

`src/app/_components/RunDuration.tsx` 생성:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { RunStatus } from "@/lib/pipeline/types";
import { computeDurationSeconds, formatDuration } from "@/lib/time/duration";

interface Props {
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  className?: string;
}

// 진행 중이면 1초마다 경과를 갱신하는 라이브 타이머. 종료된 run은 정적 표시.
export function RunDuration({ status, startedAt, finishedAt, createdAt, updatedAt, className }: Props) {
  const isLive = status === "running" && !!startedAt && !finishedAt;
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isLive) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive]);

  const base = className ?? "font-mono text-[13px] text-muted";
  // SSR/최초 렌더는 서버 시계 기준 안정값(hydration mismatch 방지). 라이브는 마운트 후 nowMs로 갱신.
  const view = computeDurationSeconds(
    { status, startedAt, finishedAt, createdAt, updatedAt },
    nowMs ?? Date.parse(updatedAt),
  );

  if (view.kind === "pending") return <span className={base}>대기 중</span>;
  return <span className={base}>{formatDuration(view.seconds)}</span>;
}
```

- [ ] **Step 2: 이력 목록에 컬럼 추가**

`src/app/runs/page.tsx`: 상단 import에 추가
```tsx
import { RunDuration } from "../_components/RunDuration";
```
`<thead>`의 "트리거" `<th>`(86~88행)와 "상태" `<th>`(89~91행) 사이에 헤더 셀 추가:
```tsx
                  <th className="px-3 py-3 text-center">
                    <SectionLabel>트리거</SectionLabel>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SectionLabel>소요시간</SectionLabel>
                  </th>
                  <th className="px-5 py-3">
                    <SectionLabel>상태</SectionLabel>
                  </th>
```
`<tbody>`의 "트리거" `<td>`(157~159행)와 "상태" `<td>`(160~162행) 사이에 셀 추가:
```tsx
                      <td className="px-3 py-3 text-center text-[13px] text-muted">
                        {run.triggerType === "scheduled" ? "예약" : "수동"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <RunDuration
                          status={run.status}
                          startedAt={run.startedAt}
                          finishedAt={run.finishedAt}
                          createdAt={run.createdAt}
                          updatedAt={run.updatedAt}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                      </td>
```

- [ ] **Step 3: 상세 페이지에 소요시간 표시**

`src/app/runs/[id]/RunStatus.tsx`: 상단 import에 추가
```tsx
import { RunDuration } from "@/app/_components/RunDuration";
```
상태 라벨 블록(245~258행)에서 `{STAGE_LABELS[run.stage]} · {STATUS_LABELS[run.status]}` 줄 다음, 그 `<div>`가 닫힌 직후(258행 `</div>` 뒤, `run.imageTag` 블록 앞)에 소요시간 줄 추가:
```tsx
          {STAGE_LABELS[run.stage]} · {STATUS_LABELS[run.status]}
        </div>
        <div className="mt-1 text-[13px] text-muted">
          소요시간:{" "}
          <RunDuration
            status={run.status}
            startedAt={run.startedAt}
            finishedAt={run.finishedAt}
            createdAt={run.createdAt}
            updatedAt={run.updatedAt}
            className="font-mono text-[13px] text-text"
          />
        </div>
```

- [ ] **Step 4: 배치 목록에 컬럼 추가**

`src/app/runs/batch/[batchId]/page.tsx`: 상단 import에 추가
```tsx
import { RunDuration } from "../../../_components/RunDuration";
```
`<thead>`의 마지막 "상태" `<th>`(83~85행) 바로 앞에 헤더 셀 추가:
```tsx
                <th className="px-5 py-3">
                  <SectionLabel>소요시간</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>상태</SectionLabel>
                </th>
```
`<tbody>`의 마지막 "상태" `<td>`(137~139행, `<StatusBadge>` 포함) 바로 앞에 셀 추가:
```tsx
                    <td className="px-5 py-3">
                      <RunDuration
                        status={run.status}
                        startedAt={run.startedAt}
                        finishedAt={run.finishedAt}
                        createdAt={run.createdAt}
                        updatedAt={run.updatedAt}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                    </td>
```

- [ ] **Step 5: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/_components/RunDuration.tsx" "src/app/runs/page.tsx" "src/app/runs/[id]/RunStatus.tsx" "src/app/runs/batch/[batchId]/page.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 6: 전체 테스트 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run 2>&1 | tail -3`
Expected: 전부 통과.

```bash
git add src/app/_components/RunDuration.tsx "src/app/runs/page.tsx" "src/app/runs/[id]/RunStatus.tsx" "src/app/runs/batch/[batchId]/page.tsx"
git commit -m "feat: 점검 이력·상세·배치에 소요시간 표시(진행 중 라이브 타이머)"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 새 점검을 실행해 상세 페이지에서 소요시간이 1초 단위로 증가하다가 완료 시 확정되는지 확인.
- 점검 이력 목록·배치 목록에 소요시간 컬럼이 기존 디자인과 어울리게 표시되는지 확인.
- 과거 이력 run의 소요시간이 근사값으로 표시되는지(빈칸 아님) 확인.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul) + 공개 URL 200 확인.
