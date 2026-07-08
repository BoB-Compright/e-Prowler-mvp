# C: 점검 스케줄링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자산(레포/서버)별로 매일/매주/매월 정기 점검 스케줄을 걸어두면, 서버 프로세스가 떠 있는 동안 in-process로 due한 스케줄을 감지해 자동으로 점검을 트리거한다. 재기동 시 놓친 스케줄은 즉시 캐치업하고, 진행 중인 run과 충돌하면 스킵한다.

**Architecture:** 기존 `better-sqlite3` 단일 파일 DB에 `schedules` 테이블(자산당 1개)과 `runs.trigger_type` 컬럼을 추가한다. `src/lib/scheduling/scheduler.ts`가 `setInterval`(1분)로 due 스케줄을 체크하고, 자산 타입에 따라 기존 레포 파이프라인(`runPipeline`, A1) 또는 서버 스캔(`scanServerAsset`, A2)을 그대로 재사용해 트리거한다. 외부 큐/cron 라이브러리는 쓰지 않는다(A1/A2와 동일 원칙). 모든 신규 함수는 기존 `PipelineDeps`/`SandboxTimeoutDeps` 패턴과 동일하게 의존성 주입 가능한 형태로 만들어, 실제 SSH/Docker 파이프라인을 타지 않고 단위 테스트한다.

**Tech Stack:** A1/A2와 동일 (Next.js 16.2.9 App Router / React 19 / TypeScript strict / better-sqlite3 / Vitest / Tailwind v4). 신규 의존성 없음.

## Global Constraints

- **선행 조건**: 이 플랜은 A1(`docs/superpowers/plans/2026-07-08-asset-management-project-grouping-plan.md`)과 A2(`docs/superpowers/plans/2026-07-08-ssh-scan-execution-engine-plan.md`)가 이미 구현되어 있다고 전제한다 — `assets`/`projects` 테이블, `@/lib/assets/store`(`getAsset`, `listAssets`, `createRepoAsset`, `createServerAsset`, `deleteAsset`), `runs.asset_id`/`Run.assetId`, `createRun(source, sourceType, assetId, db?)`, `@/lib/pipeline/serverScan`의 `scanServerAsset(assetId, batchId?): Promise<string>`가 이미 존재해야 한다. 아직 구현되지 않았다면 이 플랜보다 먼저 실행한다.
- Next.js 16 App Router 규칙: 동적 라우트 `params`는 항상 `Promise`이며 `await`로 해석한다.
- 모든 신규 lib 함수는 마지막 인자로 `db: Database = getDb()`를 받는다. 실제 파이프라인 실행(Docker/SSH)을 호출하는 함수는 `orchestrator.ts`의 `PipelineDeps`, `sandboxTimeout.ts`의 `SandboxTimeoutDeps`와 동일하게 `deps` 객체를 `db` 바로 앞 인자로 받아 테스트에서 페이크로 주입 가능해야 한다.
- API 에러 메시지는 한국어로 작성한다 (`NextResponse.json({ error: "..." }, { status })`).
- 테스트는 Vitest, 대상 파일과 같은 디렉터리에 `*.test.ts`로 co-locate한다.
- DB 스키마 변경은 `src/lib/db/index.ts`의 `SCHEMA` 문자열에 추가하고, 기존 테이블에 컬럼을 추가할 때는 `migrate()`에 `PRAGMA table_info` 기반 idempotent `ALTER TABLE`을 추가한다.
- 신규 UI는 `src/app/assets`, `src/app/runs`의 기존 스타일(이름 있는 함수 컴포넌트, Tailwind + `var(--color-*)` CSS 변수, 인터랙션만 별도 client 컴포넌트로 분리)을 따른다. 범용 컴포넌트 라이브러리를 새로 만들지 않는다.
- 외부 큐/cron 라이브러리를 추가하지 않는다 — in-process `setInterval` 체크로 충분하다.
- 컴플라이언스 프레임워크(B)는 이 플랜의 스코프 밖이다. 스케줄된 점검도 현재와 동일하게 단일 카탈로그 기준으로 실행된다.

---

### Task 1: DB 스키마 — `schedules` 테이블 및 `runs.trigger_type` 컬럼

**Files:**
- Modify: `src/lib/db/index.ts`
- Test: `src/lib/db/index.test.ts` (A1/A2에서 만든 파일에 케이스 추가)

**Interfaces:**
- Produces: `schedules` 테이블(`id, asset_id, frequency, day_of_week, day_of_month, time_of_day, enabled, next_run_at, last_run_at, last_skip_reason, created_at, updated_at`), `runs.trigger_type` 컬럼(TEXT NOT NULL DEFAULT 'manual')

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/db/index.test.ts`에 케이스 추가:

```ts
it("creates schedules table with runs.trigger_type column", () => {
  const db = createInMemoryDb();
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((row) => (row as { name: string }).name);
  expect(tables).toContain("schedules");

  const runColumns = db
    .prepare(`PRAGMA table_info(runs)`)
    .all()
    .map((row) => (row as { name: string }).name);
  expect(runColumns).toContain("trigger_type");

  const scheduleColumns = db
    .prepare(`PRAGMA table_info(schedules)`)
    .all()
    .map((row) => (row as { name: string }).name);
  expect(scheduleColumns).toEqual([
    "id", "asset_id", "frequency", "day_of_week", "day_of_month", "time_of_day",
    "enabled", "next_run_at", "last_run_at", "last_skip_reason", "created_at", "updated_at",
  ]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/db/index.test.ts`
Expected: FAIL (`schedules` 테이블 없음, `trigger_type` 컬럼 없음)

- [ ] **Step 3: 스키마 추가**

`src/lib/db/index.ts`의 `SCHEMA` 문자열 끝(기존 `assets`/`scan_batches` 테이블 뒤)에 추가:

```ts
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id),
  frequency TEXT NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  time_of_day TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_skip_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`migrate()` 함수에 추가 (기존 `source_type`/`asset_id`/`batch_id` 체크 블록 뒤):

```ts
if (!runColumns.some((column) => column.name === "trigger_type")) {
  db.exec(`ALTER TABLE runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'`);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/db/index.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/index.ts src/lib/db/index.test.ts
git commit -m "feat: schedules 테이블과 runs.trigger_type 컬럼 추가"
```

---

### Task 2: `computeNextRun` 순수 함수

**Files:**
- Create: `src/lib/scheduling/nextRun.ts`
- Test: `src/lib/scheduling/nextRun.test.ts`

**Interfaces:**
- Consumes: 없음 (독립 모듈)
- Produces: `ScheduleFrequency = "daily" | "weekly" | "monthly"`, `ScheduleRecurrence { frequency, dayOfWeek: number | null, dayOfMonth: number | null, timeOfDay: string }`, `computeNextRun(schedule: ScheduleRecurrence, from: Date): Date`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/scheduling/nextRun.test.ts
import { describe, expect, it } from "vitest";
import { computeNextRun } from "./nextRun";

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("computeNextRun", () => {
  it("daily: rolls to tomorrow once today's time has passed", () => {
    const from = new Date(2026, 6, 8, 10, 0, 0); // 2026-07-08 10:00 (month is 0-indexed)
    const next = computeNextRun(
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00" },
      from,
    );
    expect(ymd(next)).toBe("2026-07-09");
    expect(next.getHours()).toBe(3);
    expect(next.getMinutes()).toBe(0);
  });

  it("daily: stays today when today's time has not passed yet", () => {
    const from = new Date(2026, 6, 8, 1, 0, 0);
    const next = computeNextRun(
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00" },
      from,
    );
    expect(ymd(next)).toBe("2026-07-08");
  });

  it("weekly: finds the next occurrence of the target weekday", () => {
    const from = new Date(2026, 6, 8, 10, 0, 0); // Wednesday (day 3)
    const next = computeNextRun(
      { frequency: "weekly", dayOfWeek: 1, dayOfMonth: null, timeOfDay: "03:00" }, // next Monday
      from,
    );
    expect(next.getDay()).toBe(1);
    expect(ymd(next)).toBe("2026-07-13");
  });

  it("weekly: rolls a full week when today is the target day but its time already passed", () => {
    const from = new Date(2026, 6, 8, 10, 0, 0); // Wednesday, 10:00
    const next = computeNextRun(
      { frequency: "weekly", dayOfWeek: 3, dayOfMonth: null, timeOfDay: "03:00" },
      from,
    );
    expect(ymd(next)).toBe("2026-07-15"); // next Wednesday, not today
  });

  it("monthly: clamps to the last day of a short month", () => {
    const from = new Date(2026, 1, 1, 0, 0, 0); // 2026-02-01
    const next = computeNextRun(
      { frequency: "monthly", dayOfWeek: null, dayOfMonth: 31, timeOfDay: "03:00" },
      from,
    );
    expect(ymd(next)).toBe("2026-02-28"); // 2026 is not a leap year
  });

  it("monthly: rolls to next month once this month's clamped occurrence has passed", () => {
    const from = new Date(2026, 1, 28, 10, 0, 0); // 2026-02-28 10:00
    const next = computeNextRun(
      { frequency: "monthly", dayOfWeek: null, dayOfMonth: 31, timeOfDay: "03:00" },
      from,
    );
    expect(ymd(next)).toBe("2026-03-31");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/scheduling/nextRun.test.ts`
Expected: FAIL (`./nextRun` 모듈 없음)

- [ ] **Step 3: 구현**

```ts
// src/lib/scheduling/nextRun.ts
export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export interface ScheduleRecurrence {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null; // 0=일요일 ~ 6=토요일, weekly일 때만 사용
  dayOfMonth: number | null; // 1~31, monthly일 때만 사용
  timeOfDay: string; // "HH:mm", 로컬 시각
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseTimeOfDay(timeOfDay: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  return { hours, minutes };
}

export function computeNextRun(schedule: ScheduleRecurrence, from: Date): Date {
  const { hours, minutes } = parseTimeOfDay(schedule.timeOfDay);

  if (schedule.frequency === "daily") {
    const next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hours, minutes, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  if (schedule.frequency === "weekly") {
    const targetDay = schedule.dayOfWeek as number;
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hours, minutes, 0, 0);
    let diff = (targetDay - candidate.getDay() + 7) % 7;
    if (diff === 0 && candidate <= from) diff = 7;
    candidate.setDate(candidate.getDate() + diff);
    return candidate;
  }

  // monthly
  const targetDayOfMonth = schedule.dayOfMonth as number;
  function candidateFor(year: number, monthIndex: number): Date {
    const day = Math.min(targetDayOfMonth, lastDayOfMonth(year, monthIndex));
    return new Date(year, monthIndex, day, hours, minutes, 0, 0);
  }
  let candidate = candidateFor(from.getFullYear(), from.getMonth());
  if (candidate <= from) {
    candidate = candidateFor(from.getFullYear(), from.getMonth() + 1);
  }
  return candidate;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/scheduling/nextRun.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/scheduling/nextRun.ts src/lib/scheduling/nextRun.test.ts
git commit -m "feat: 스케줄 다음 실행 시각 계산 함수 추가"
```

---

### Task 3: `Run` 타입에 `triggerType` 추가 + `markRunTriggerType`

**Files:**
- Modify: `src/lib/pipeline/types.ts`
- Modify: `src/lib/pipeline/runs.ts`
- Test: `src/lib/pipeline/runs.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `RunTriggerType = "manual" | "scheduled"`, `Run.triggerType: RunTriggerType`, `markRunTriggerType(runId: string, triggerType: RunTriggerType, db?: Database): void`

> `createRun`의 시그니처는 바꾸지 않는다 — 모든 run은 생성 시 기존처럼 `'manual'`로 시작하고(컬럼 기본값과 동일), 스케줄러가 트리거를 마친 직후 `markRunTriggerType`으로 `'scheduled'`로 덮어쓴다. 이렇게 하면 A1/A2가 이미 만든 `createRun` 호출부(API 라우트, `scanServerAsset` 등)를 하나도 건드릴 필요가 없다.

- [ ] **Step 1: 실제 파일 확인**

`src/lib/pipeline/types.ts`와 `src/lib/pipeline/runs.ts`를 Read로 열어 `Run` 인터페이스, `RunRow`, `toRun()`, `createRun()`의 현재 상태(A1의 `assetId`, A2의 `batchId` 추가 반영 여부)를 확인한다.

- [ ] **Step 2: 실패하는 테스트 추가**

`src/lib/pipeline/runs.test.ts`에 추가 (기존 `import`에 `markRunTriggerType` 추가):

```ts
it("defaults triggerType to manual and can be marked scheduled", () => {
  const run = createRun("https://github.com/owner/repo.git", "git", null, db);
  expect(run.triggerType).toBe("manual");

  markRunTriggerType(run.id, "scheduled", db);

  expect(getRun(run.id, db)!.triggerType).toBe("scheduled");
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/lib/pipeline/runs.test.ts`
Expected: FAIL (`run.triggerType` undefined, `markRunTriggerType` not exported)

- [ ] **Step 4: 타입 추가**

`src/lib/pipeline/types.ts`에 추가:

```ts
export type RunTriggerType = "manual" | "scheduled";
```

`Run` 인터페이스에 필드 추가:

```ts
triggerType: RunTriggerType;
```

- [ ] **Step 5: `runs.ts` 구현**

`RunRow` 인터페이스에 `trigger_type: RunTriggerType;` 추가. `toRun()`에 `triggerType: row.trigger_type,` 추가.

`createRun()`이 만드는 `run` 객체 리터럴에 `triggerType: "manual",` 추가 (INSERT SQL의 컬럼 목록은 그대로 둔다 — `trigger_type` 컬럼은 DB `DEFAULT 'manual'`이 적용된다).

파일 끝에 추가:

```ts
export function markRunTriggerType(
  runId: string,
  triggerType: RunTriggerType,
  db: Database = getDb(),
): void {
  db.prepare(`UPDATE runs SET trigger_type = ? WHERE id = ?`).run(triggerType, runId);
}
```

`import type { Run, RunEvent, RunSourceType, RunStatus, Stage } from "./types";`에 `RunTriggerType`을 추가한다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/lib/pipeline/runs.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/lib/pipeline/types.ts src/lib/pipeline/runs.ts src/lib/pipeline/runs.test.ts
git commit -m "feat: Run에 triggerType(manual/scheduled) 필드 추가"
```

---

### Task 4: schedules store — CRUD + due 조회

**Files:**
- Create: `src/lib/scheduling/types.ts`
- Create: `src/lib/scheduling/store.ts`
- Test: `src/lib/scheduling/store.test.ts`

**Interfaces:**
- Consumes: `getDb`, `createInMemoryDb` (`@/lib/db`), `computeNextRun`, `ScheduleRecurrence` (`./nextRun`), `createRepoAsset` (`@/lib/assets/store`, 테스트에서만)
- Produces:
  - `Schedule` 인터페이스 (`id, assetId, frequency, dayOfWeek, dayOfMonth, timeOfDay, enabled, nextRunAt, lastRunAt, lastSkipReason, createdAt, updatedAt`)
  - `ScheduleInput { frequency, dayOfWeek: number | null, dayOfMonth: number | null, timeOfDay: string, enabled: boolean }`
  - `getScheduleByAsset(assetId: string, db?): Schedule | undefined`
  - `upsertSchedule(assetId: string, input: ScheduleInput, now?: Date, db?): Schedule`
  - `deleteScheduleForAsset(assetId: string, db?): void`
  - `listDueSchedules(now?: Date, db?): Schedule[]`
  - `recordTriggered(scheduleId: string, now?: Date, db?): void`
  - `recordSkipped(scheduleId: string, reason: string, now?: Date, db?): void`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/scheduling/store.test.ts
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset } from "@/lib/assets/store";
import {
  deleteScheduleForAsset,
  getScheduleByAsset,
  listDueSchedules,
  recordSkipped,
  recordTriggered,
  upsertSchedule,
} from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("schedules store", () => {
  it("creates a schedule and computes next_run_at", () => {
    const asset = createRepoAsset({ displayName: "repo-a", repoUrl: "https://github.com/x/y" }, db);
    const now = new Date(2026, 6, 8, 10, 0, 0);

    const schedule = upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      now,
      db,
    );

    expect(schedule.assetId).toBe(asset.id);
    expect(schedule.nextRunAt).toBe(new Date(2026, 6, 9, 3, 0, 0).toISOString());
  });

  it("upserts in place — a second call updates rather than duplicating", () => {
    const asset = createRepoAsset({ displayName: "repo-a", repoUrl: "https://github.com/x/y" }, db);
    const now = new Date(2026, 6, 8, 10, 0, 0);

    upsertSchedule(asset.id, { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true }, now, db);
    upsertSchedule(asset.id, { frequency: "weekly", dayOfWeek: 1, dayOfMonth: null, timeOfDay: "05:00", enabled: true }, now, db);

    const schedule = getScheduleByAsset(asset.id, db)!;
    expect(schedule.frequency).toBe("weekly");
    const count = db.prepare(`SELECT COUNT(*) as c FROM schedules`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("lists only enabled schedules that are due", () => {
    const assetA = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const assetB = createRepoAsset({ displayName: "b", repoUrl: "https://github.com/x/b" }, db);
    const setupNow = new Date(2026, 6, 8, 10, 0, 0);

    upsertSchedule(assetA.id, { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true }, setupNow, db);
    const scheduleB = upsertSchedule(assetB.id, { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: false }, setupNow, db);

    const due = listDueSchedules(new Date(2026, 6, 10, 0, 0, 0), db);

    expect(due.map((s) => s.assetId)).toEqual([assetA.id]);
    expect(due.some((s) => s.id === scheduleB.id)).toBe(false);
  });

  it("recordTriggered clears last_skip_reason, sets last_run_at, and advances next_run_at", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const created = upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      new Date(2026, 6, 8, 1, 0, 0),
      db,
    );
    recordSkipped(created.id, "이미 진행 중인 run 존재", new Date(2026, 6, 8, 3, 0, 0), db);

    recordTriggered(created.id, new Date(2026, 6, 9, 3, 0, 0), db);

    const updated = getScheduleByAsset(asset.id, db)!;
    expect(updated.lastSkipReason).toBeNull();
    expect(updated.lastRunAt).toBe(new Date(2026, 6, 9, 3, 0, 0).toISOString());
    expect(new Date(updated.nextRunAt).getTime()).toBeGreaterThan(new Date(2026, 6, 9, 3, 0, 0).getTime());
  });

  it("recordSkipped leaves last_run_at untouched and records the reason", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const created = upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      new Date(2026, 6, 8, 1, 0, 0),
      db,
    );

    recordSkipped(created.id, "이미 진행 중인 run 존재", new Date(2026, 6, 8, 3, 0, 0), db);

    const updated = getScheduleByAsset(asset.id, db)!;
    expect(updated.lastRunAt).toBeNull();
    expect(updated.lastSkipReason).toBe("이미 진행 중인 run 존재");
  });

  it("deleteScheduleForAsset removes the row", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    upsertSchedule(asset.id, { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true }, new Date(), db);

    deleteScheduleForAsset(asset.id, db);

    expect(getScheduleByAsset(asset.id, db)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/scheduling/store.test.ts`
Expected: FAIL (`./store` 모듈 없음)

- [ ] **Step 3: 타입 정의**

```ts
// src/lib/scheduling/types.ts
import type { ScheduleFrequency } from "./nextRun";

export type { ScheduleFrequency };

export interface Schedule {
  id: string;
  assetId: string;
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastSkipReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleInput {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  enabled: boolean;
}
```

- [ ] **Step 4: 최소 구현**

```ts
// src/lib/scheduling/store.ts
import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { computeNextRun } from "./nextRun";
import type { Schedule, ScheduleInput } from "./types";

interface ScheduleRow {
  id: string;
  asset_id: string;
  frequency: Schedule["frequency"];
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  enabled: number;
  next_run_at: string;
  last_run_at: string | null;
  last_skip_reason: string | null;
  created_at: string;
  updated_at: string;
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    assetId: row.asset_id,
    frequency: row.frequency,
    dayOfWeek: row.day_of_week,
    dayOfMonth: row.day_of_month,
    timeOfDay: row.time_of_day,
    enabled: row.enabled === 1,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastSkipReason: row.last_skip_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getScheduleByAsset(assetId: string, db: Database = getDb()): Schedule | undefined {
  const row = db.prepare(`SELECT * FROM schedules WHERE asset_id = ?`).get(assetId) as ScheduleRow | undefined;
  return row ? toSchedule(row) : undefined;
}

// 자산당 스케줄 1개(UNIQUE asset_id) — 이미 있으면 갱신, 없으면 생성.
// 규칙이 바뀔 때마다 next_run_at을 `now` 기준으로 다시 계산해 즉시 반영한다.
export function upsertSchedule(
  assetId: string,
  input: ScheduleInput,
  now: Date = new Date(),
  db: Database = getDb(),
): Schedule {
  const existing = getScheduleByAsset(assetId, db);
  const nextRunAt = computeNextRun(
    { frequency: input.frequency, dayOfWeek: input.dayOfWeek, dayOfMonth: input.dayOfMonth, timeOfDay: input.timeOfDay },
    now,
  ).toISOString();
  const nowIso = now.toISOString();

  if (existing) {
    db.prepare(
      `UPDATE schedules SET frequency = @frequency, day_of_week = @dayOfWeek, day_of_month = @dayOfMonth,
       time_of_day = @timeOfDay, enabled = @enabled, next_run_at = @nextRunAt, updated_at = @updatedAt
       WHERE asset_id = @assetId`,
    ).run({
      assetId,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      timeOfDay: input.timeOfDay,
      enabled: input.enabled ? 1 : 0,
      nextRunAt,
      updatedAt: nowIso,
    });
  } else {
    db.prepare(
      `INSERT INTO schedules (id, asset_id, frequency, day_of_week, day_of_month, time_of_day, enabled, next_run_at, last_run_at, last_skip_reason, created_at, updated_at)
       VALUES (@id, @assetId, @frequency, @dayOfWeek, @dayOfMonth, @timeOfDay, @enabled, @nextRunAt, NULL, NULL, @createdAt, @updatedAt)`,
    ).run({
      id: randomUUID(),
      assetId,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      timeOfDay: input.timeOfDay,
      enabled: input.enabled ? 1 : 0,
      nextRunAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  return getScheduleByAsset(assetId, db)!;
}

export function deleteScheduleForAsset(assetId: string, db: Database = getDb()): void {
  db.prepare(`DELETE FROM schedules WHERE asset_id = ?`).run(assetId);
}

export function listDueSchedules(now: Date = new Date(), db: Database = getDb()): Schedule[] {
  const rows = db
    .prepare(`SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC`)
    .all(now.toISOString()) as ScheduleRow[];
  return rows.map(toSchedule);
}

export function recordTriggered(scheduleId: string, now: Date = new Date(), db: Database = getDb()): void {
  const row = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(scheduleId) as ScheduleRow | undefined;
  if (!row) return;
  const nextRunAt = computeNextRun(
    { frequency: row.frequency, dayOfWeek: row.day_of_week, dayOfMonth: row.day_of_month, timeOfDay: row.time_of_day },
    now,
  ).toISOString();
  db.prepare(
    `UPDATE schedules SET last_run_at = @now, last_skip_reason = NULL, next_run_at = @nextRunAt, updated_at = @now WHERE id = @id`,
  ).run({ id: scheduleId, now: now.toISOString(), nextRunAt });
}

export function recordSkipped(
  scheduleId: string,
  reason: string,
  now: Date = new Date(),
  db: Database = getDb(),
): void {
  const row = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(scheduleId) as ScheduleRow | undefined;
  if (!row) return;
  const nextRunAt = computeNextRun(
    { frequency: row.frequency, dayOfWeek: row.day_of_week, dayOfMonth: row.day_of_month, timeOfDay: row.time_of_day },
    now,
  ).toISOString();
  db.prepare(
    `UPDATE schedules SET last_skip_reason = @reason, next_run_at = @nextRunAt, updated_at = @now WHERE id = @id`,
  ).run({ id: scheduleId, reason, now: now.toISOString(), nextRunAt });
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/scheduling/store.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/scheduling/
git commit -m "feat: schedules store(CRUD, due 조회, trigger/skip 기록) 추가"
```

---

### Task 5: `deleteAsset`에 스케줄 cascade 삭제 추가

**Files:**
- Modify: `src/lib/assets/store.ts`
- Test: `src/lib/assets/store.test.ts` (A1에서 만든 파일에 케이스 추가)

**Interfaces:**
- Consumes: `upsertSchedule`, `getScheduleByAsset` (`@/lib/scheduling/store`, 테스트에서만)

> 이 코드베이스는 SQLite FK `ON DELETE CASCADE`를 신뢰하지 않는다(`PRAGMA foreign_keys`가 켜져 있지 않음) — A1의 `deleteAsset`도 `runs`/`assets` 삭제를 트랜잭션 안에서 명시적으로 처리한다. `schedules`도 같은 방식으로 추가한다.
>
> **[병합 후 보정]** 실제 병합된 `deleteAsset`(`src/lib/assets/store.ts`)은 아래 Step 3 코드보다 한 단계 더 처리한다 — `runs` 삭제 전에 해당 자산의 모든 run에 대해 `run_events`/`check_results`/`analysis_reports`를 먼저 지운다. Step 3는 이 실제 구조에 맞춰 갱신했다.

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/assets/store.test.ts`의 import에 `upsertSchedule`, `getScheduleByAsset` (`@/lib/scheduling/store`)을 추가하고, 아래 케이스를 추가한다:

```ts
it("cascades schedule deletion when an asset is deleted", () => {
  const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
  upsertSchedule(
    asset.id,
    { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
    new Date(),
    db,
  );

  deleteAsset(asset.id, db);

  expect(getScheduleByAsset(asset.id, db)).toBeUndefined();
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/assets/store.test.ts`
Expected: FAIL (스케줄 행이 삭제되지 않고 남아 있음)

- [ ] **Step 3: `deleteAsset` 수정**

`src/lib/assets/store.ts`의 `deleteAsset` 트랜잭션 맨 앞(runIds 조회/삭제 루프보다 먼저)에 한 줄 추가:

```ts
export function deleteAsset(id: string, db: Database = getDb()): void {
  const runningRun = db
    .prepare(`SELECT id FROM runs WHERE asset_id = ? AND status = 'running'`)
    .get(id);
  if (runningRun) {
    throw new AssetInUseError("실행 중인 점검이 있어 삭제할 수 없습니다");
  }
  const deleteTransaction = db.transaction(() => {
    db.prepare(`DELETE FROM schedules WHERE asset_id = ?`).run(id);
    const runIds = (
      db.prepare(`SELECT id FROM runs WHERE asset_id = ?`).all(id) as { id: string }[]
    ).map((row) => row.id);
    for (const runId of runIds) {
      db.prepare(`DELETE FROM run_events WHERE run_id = ?`).run(runId);
      db.prepare(`DELETE FROM check_results WHERE run_id = ?`).run(runId);
      db.prepare(`DELETE FROM analysis_reports WHERE run_id = ?`).run(runId);
    }
    db.prepare(`DELETE FROM runs WHERE asset_id = ?`).run(id);
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(id);
  });
  deleteTransaction();
}
```

(트랜잭션 맨 앞의 `db.prepare(\`DELETE FROM schedules WHERE asset_id = ?\`).run(id);` 한 줄만 신규 추가고, 나머지는 기존 코드 그대로다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/assets/store.test.ts`
Expected: PASS (기존 케이스 포함 전체 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/assets/store.ts src/lib/assets/store.test.ts
git commit -m "feat: 자산 삭제 시 스케줄도 함께 cascade 삭제"
```

---

### Task 6: 자산 트리거 헬퍼 — `hasActiveRun`, `triggerRunForAsset`

**Files:**
- Create: `src/lib/scheduling/trigger.ts`
- Test: `src/lib/scheduling/trigger.test.ts`

**Interfaces:**
- Consumes: `Asset` (`@/lib/assets/types`), `createRun`, `getRun`, `markRunTriggerType` (`@/lib/pipeline/runs`), `runPipeline` (`@/lib/pipeline/orchestrator`), `scanServerAsset` (`@/lib/pipeline/serverScan`), `RunTriggerType` (`@/lib/pipeline/types`), `createRepoAsset`, `createServerAsset` (`@/lib/assets/store`, 테스트에서만)
- Produces:
  - `hasActiveRun(assetId: string, db?): boolean`
  - `TriggerDeps { runPipeline: typeof runPipeline; scanServerAsset: typeof scanServerAsset }`
  - `triggerRunForAsset(asset: Asset, triggerType: RunTriggerType, deps?: TriggerDeps, db?: Database): Promise<string>` — 반환값은 생성된 runId

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/scheduling/trigger.test.ts
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset, createServerAsset } from "@/lib/assets/store";
import { createRun, getRun, updateRunStage } from "@/lib/pipeline/runs";
import { hasActiveRun, triggerRunForAsset, type TriggerDeps } from "./trigger";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("hasActiveRun", () => {
  it("is false when the asset has no runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    expect(hasActiveRun(asset.id, db)).toBe(false);
  });

  it("is true while a run is in progress and false once it finishes", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun(asset.repoUrl!, "git", asset.id, db);
    expect(hasActiveRun(asset.id, db)).toBe(true);

    updateRunStage(run.id, "done", "succeeded", {}, db);
    expect(hasActiveRun(asset.id, db)).toBe(false);
  });
});

describe("triggerRunForAsset", () => {
  it("creates a git run and marks it with the given trigger type for a repo asset", async () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const deps: TriggerDeps = {
      runPipeline: vi.fn().mockResolvedValue(undefined),
      scanServerAsset: vi.fn(),
    };

    const runId = await triggerRunForAsset(asset, "scheduled", deps, db);

    expect(deps.runPipeline).toHaveBeenCalledWith(
      runId,
      { type: "git", repoUrl: asset.repoUrl },
      undefined,
      db,
    );
    expect(deps.scanServerAsset).not.toHaveBeenCalled();
    const run = getRun(runId, db)!;
    expect(run.assetId).toBe(asset.id);
    expect(run.triggerType).toBe("scheduled");
  });

  it("delegates to scanServerAsset for a server asset and marks the resulting run", async () => {
    const asset = createServerAsset(
      { displayName: "srv", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "root", secret: "pw" },
      db,
    );
    const preCreatedRun = createRun(asset.hostIp!, "server", asset.id, db);
    const deps: TriggerDeps = {
      runPipeline: vi.fn(),
      scanServerAsset: vi.fn().mockResolvedValue(preCreatedRun.id),
    };

    const runId = await triggerRunForAsset(asset, "scheduled", deps, db);

    expect(deps.scanServerAsset).toHaveBeenCalledWith(asset.id, null);
    expect(deps.runPipeline).not.toHaveBeenCalled();
    expect(runId).toBe(preCreatedRun.id);
    expect(getRun(runId, db)!.triggerType).toBe("scheduled");
  });
});
```

> 두 번째 테스트에서 `createRun`으로 run을 미리 만들어 `scanServerAsset`이 반환할 runId를 준비하는 이유: 실제 `scanServerAsset`은 내부적으로 run을 생성하지만, 여기서는 `deps.scanServerAsset`을 페이크로 주입하므로 그 동작을 흉내내기 위해 테스트에서 직접 run을 만들어 둔다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/scheduling/trigger.test.ts`
Expected: FAIL (`./trigger` 모듈 없음)

- [ ] **Step 3: 구현**

```ts
// src/lib/scheduling/trigger.ts
import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Asset } from "@/lib/assets/types";
import { createRun, markRunTriggerType } from "@/lib/pipeline/runs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { scanServerAsset } from "@/lib/pipeline/serverScan";
import type { RunTriggerType } from "@/lib/pipeline/types";

export interface TriggerDeps {
  runPipeline: typeof runPipeline;
  scanServerAsset: typeof scanServerAsset;
}

const defaultDeps: TriggerDeps = { runPipeline, scanServerAsset };

export function hasActiveRun(assetId: string, db: Database = getDb()): boolean {
  const row = db.prepare(`SELECT 1 FROM runs WHERE asset_id = ? AND status = 'running'`).get(assetId);
  return row !== undefined;
}

// 수동 트리거(POST /api/runs, POST /api/projects/[id]/scan)와 동일한 실행 경로를
// 그대로 타고, 생성된 run에만 trigger_type을 남긴다.
export async function triggerRunForAsset(
  asset: Asset,
  triggerType: RunTriggerType,
  deps: TriggerDeps = defaultDeps,
  db: Database = getDb(),
): Promise<string> {
  if (asset.type === "server") {
    const runId = await deps.scanServerAsset(asset.id, null);
    markRunTriggerType(runId, triggerType, db);
    return runId;
  }
  const run = createRun(asset.repoUrl!, "git", asset.id, db);
  void deps.runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! }, undefined, db);
  markRunTriggerType(run.id, triggerType, db);
  return run.id;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/scheduling/trigger.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/scheduling/trigger.ts src/lib/scheduling/trigger.test.ts
git commit -m "feat: 자산 타입별 실행 경로를 통일하는 triggerRunForAsset 추가"
```

---

### Task 7: 스케줄 체커 — `checkDueSchedules`, `startScheduler`

**Files:**
- Create: `src/lib/scheduling/scheduler.ts`
- Test: `src/lib/scheduling/scheduler.test.ts`

**Interfaces:**
- Consumes: `getAsset` (`@/lib/assets/store`), `listDueSchedules`, `recordSkipped`, `recordTriggered` (`./store`), `hasActiveRun`, `triggerRunForAsset` (`./trigger`), `createRepoAsset` (`@/lib/assets/store`, 테스트에서만), `upsertSchedule` (`./store`, 테스트에서만)
- Produces:
  - `SchedulerDeps { hasActiveRun: typeof hasActiveRun; triggerRunForAsset: (asset, triggerType, db?) => Promise<string> }`
  - `checkDueSchedules(now?: Date, deps?: SchedulerDeps, db?: Database): Promise<void>`
  - `startScheduler(deps?: SchedulerDeps, db?: Database): void` — 즉시 1회 체크 후 60초 간격 반복. 이미 실행 중이면 아무것도 하지 않음(idempotent)
  - `stopScheduler(): void`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/scheduling/scheduler.test.ts
import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset } from "@/lib/assets/store";
import { getScheduleByAsset, upsertSchedule } from "./store";
import { checkDueSchedules, startScheduler, stopScheduler, type SchedulerDeps } from "./scheduler";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
});

describe("checkDueSchedules", () => {
  it("triggers a due schedule and records it", async () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      new Date(2026, 6, 8, 1, 0, 0),
      db,
    );
    const deps: SchedulerDeps = {
      hasActiveRun: vi.fn().mockReturnValue(false),
      triggerRunForAsset: vi.fn().mockResolvedValue("run-1"),
    };

    await checkDueSchedules(new Date(2026, 6, 8, 3, 0, 1), deps, db);

    expect(deps.triggerRunForAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: asset.id }),
      "scheduled",
      db,
    );
    const schedule = getScheduleByAsset(asset.id, db)!;
    expect(schedule.lastRunAt).not.toBeNull();
  });

  it("skips and records the reason when an active run already exists", async () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      new Date(2026, 6, 8, 1, 0, 0),
      db,
    );
    const deps: SchedulerDeps = { hasActiveRun: vi.fn().mockReturnValue(true), triggerRunForAsset: vi.fn() };

    await checkDueSchedules(new Date(2026, 6, 8, 3, 0, 1), deps, db);

    expect(deps.triggerRunForAsset).not.toHaveBeenCalled();
    const schedule = getScheduleByAsset(asset.id, db)!;
    expect(schedule.lastSkipReason).toBe("이미 진행 중인 run 존재");
  });

  it("ignores schedules that are not due yet", async () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      new Date(2026, 6, 8, 10, 0, 0),
      db,
    );
    const deps: SchedulerDeps = { hasActiveRun: vi.fn(), triggerRunForAsset: vi.fn() };

    await checkDueSchedules(new Date(2026, 6, 8, 12, 0, 0), deps, db);

    expect(deps.triggerRunForAsset).not.toHaveBeenCalled();
  });

  it("skips defensively when the schedule's asset is missing", async () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const schedule = upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      new Date(2026, 6, 8, 1, 0, 0),
      db,
    );
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(asset.id); // Task 5의 cascade 경로를 우회해 방어 분기만 검증
    const deps: SchedulerDeps = { hasActiveRun: vi.fn(), triggerRunForAsset: vi.fn() };

    await checkDueSchedules(new Date(2026, 6, 8, 3, 0, 1), deps, db);

    expect(deps.triggerRunForAsset).not.toHaveBeenCalled();
    const row = db.prepare(`SELECT last_skip_reason FROM schedules WHERE id = ?`).get(schedule.id) as {
      last_skip_reason: string;
    };
    expect(row.last_skip_reason).toBe("연결된 자산을 찾을 수 없음");
  });
});

describe("startScheduler / stopScheduler", () => {
  it("checks immediately on start, then again after the interval elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 3, 0, 1));
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    upsertSchedule(
      asset.id,
      { frequency: "daily", dayOfWeek: null, dayOfMonth: null, timeOfDay: "03:00", enabled: true },
      new Date(2026, 6, 8, 1, 0, 0),
      db,
    );
    const deps: SchedulerDeps = {
      hasActiveRun: vi.fn().mockReturnValue(false),
      triggerRunForAsset: vi.fn().mockResolvedValue("run-1"),
    };

    startScheduler(deps, db);
    await vi.advanceTimersByTimeAsync(0); // flush the immediate check

    expect(deps.triggerRunForAsset).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    // 다음 날 occurrence는 아직 due가 아니므로 두 번째 호출은 없어야 한다 —
    // 이는 interval이 실제로 재실행되며 due 여부를 다시 판단한다는 것을 증명한다.
    expect(deps.triggerRunForAsset).toHaveBeenCalledTimes(1);
  });

  it("does not start a second interval when called twice", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(global, "setInterval");
    const deps: SchedulerDeps = { hasActiveRun: vi.fn(), triggerRunForAsset: vi.fn() };

    startScheduler(deps, db);
    startScheduler(deps, db);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/scheduling/scheduler.test.ts`
Expected: FAIL (`./scheduler` 모듈 없음)

- [ ] **Step 3: 구현**

```ts
// src/lib/scheduling/scheduler.ts
import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getAsset } from "@/lib/assets/store";
import { listDueSchedules, recordSkipped, recordTriggered } from "./store";
import { hasActiveRun, triggerRunForAsset } from "./trigger";
import type { RunTriggerType } from "@/lib/pipeline/types";
import type { Asset } from "@/lib/assets/types";

export interface SchedulerDeps {
  hasActiveRun: (assetId: string, db?: Database) => boolean;
  triggerRunForAsset: (asset: Asset, triggerType: RunTriggerType, db?: Database) => Promise<string>;
}

const defaultDeps: SchedulerDeps = {
  hasActiveRun,
  triggerRunForAsset: (asset, triggerType, db) => triggerRunForAsset(asset, triggerType, undefined, db),
};

const CHECK_INTERVAL_MS = 60_000;

export async function checkDueSchedules(
  now: Date = new Date(),
  deps: SchedulerDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  const due = listDueSchedules(now, db);
  for (const schedule of due) {
    const asset = getAsset(schedule.assetId, db);
    if (!asset) {
      // 정상 경로라면 Task 5의 cascade 삭제로 이 상태가 발생하지 않지만 방어적으로 처리한다.
      recordSkipped(schedule.id, "연결된 자산을 찾을 수 없음", now, db);
      continue;
    }
    if (deps.hasActiveRun(asset.id, db)) {
      recordSkipped(schedule.id, "이미 진행 중인 run 존재", now, db);
      continue;
    }
    await deps.triggerRunForAsset(asset, "scheduled", db);
    recordTriggered(schedule.id, now, db);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;

// 즉시 1회 체크 + 이후 1분 간격 반복. 서버가 꺼져 있던 동안 놓친 스케줄은
// (next_run_at <= now 조건 덕분에) 이 즉시 체크에서 자연히 캐치업된다.
export function startScheduler(deps: SchedulerDeps = defaultDeps, db: Database = getDb()): void {
  if (intervalHandle) return;
  void checkDueSchedules(new Date(), deps, db);
  intervalHandle = setInterval(() => {
    void checkDueSchedules(new Date(), deps, db);
  }, CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/scheduling/scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/scheduling/scheduler.ts src/lib/scheduling/scheduler.test.ts
git commit -m "feat: due 스케줄 체커와 in-process 스케줄러(1분 간격) 추가"
```

---

### Task 8: 서버 부팅 시 스케줄러 기동 — `src/instrumentation.ts`

**Files:**
- Create: `src/instrumentation.ts`

**Interfaces:**
- Consumes: `startScheduler` (`@/lib/scheduling/scheduler`)

> Next.js 16은 `instrumentation.ts`의 `register()`를 서버 프로세스 시작 시 1회 호출한다(안정 기능, 별도 config 플래그 불필요). `NEXT_RUNTIME === "nodejs"` 체크로 엣지 런타임에서는 실행되지 않게 한다 — 이 프로젝트는 Node 런타임만 쓰지만 방어적으로 남겨둔다.

- [ ] **Step 1: 구현**

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduling/scheduler");
    startScheduler();
  }
}
```

- [ ] **Step 2: 수동 확인**

1. `/assets/new`에서 레포 자산을 하나 등록한다.
2. sqlite3 CLI 또는 임시 API 호출로 해당 자산에 `next_run_at`이 과거인 스케줄을 만든다 (Task 9의 API가 완료된 뒤라면 `PUT /api/assets/{id}/schedule`로 아무 시각이나 넣고, DB에서 직접 `next_run_at`을 과거로 UPDATE해도 된다).
3. `npm run dev`로 서버를 (재)기동한다.
4. 1분 이내에 `/runs`에 새 run이 생기고 `trigger_type`이 `scheduled`인지 확인한다 (즉시 체크 덕분에 보통 몇 초 안에 나타난다).

- [ ] **Step 3: 커밋**

```bash
git add src/instrumentation.ts
git commit -m "feat: 서버 시작 시 스케줄러 기동(instrumentation)"
```

---

### Task 9: API — `/api/assets/[id]/schedule`

**Files:**
- Create: `src/app/api/assets/[id]/schedule/route.ts`

**Interfaces:**
- Consumes: `getAsset` (`@/lib/assets/store`), `getScheduleByAsset`, `upsertSchedule`, `deleteScheduleForAsset` (`@/lib/scheduling/store`), `ScheduleFrequency` (`@/lib/scheduling/types`)

- [ ] **Step 1: 구현**

```ts
// src/app/api/assets/[id]/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAsset } from "@/lib/assets/store";
import { deleteScheduleForAsset, getScheduleByAsset, upsertSchedule } from "@/lib/scheduling/store";
import type { ScheduleFrequency } from "@/lib/scheduling/types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface ValidScheduleInput {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  enabled: boolean;
}

function validateInput(body: unknown): ValidScheduleInput | { error: string } {
  const b = body as Record<string, unknown> | null;
  const frequency = b?.frequency;
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") {
    return { error: "frequency는 daily/weekly/monthly 중 하나여야 합니다" };
  }
  const timeOfDay = typeof b?.timeOfDay === "string" ? b.timeOfDay : "";
  if (!TIME_RE.test(timeOfDay)) {
    return { error: "timeOfDay는 'HH:mm' 형식이어야 합니다" };
  }

  let dayOfWeek: number | null = null;
  if (frequency === "weekly") {
    const value = b?.dayOfWeek;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) {
      return { error: "weekly 주기는 dayOfWeek(0~6)가 필요합니다" };
    }
    dayOfWeek = value;
  }

  let dayOfMonth: number | null = null;
  if (frequency === "monthly") {
    const value = b?.dayOfMonth;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31) {
      return { error: "monthly 주기는 dayOfMonth(1~31)가 필요합니다" };
    }
    dayOfMonth = value;
  }

  const enabled = b?.enabled !== false;
  return { frequency, dayOfWeek, dayOfMonth, timeOfDay, enabled };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "자산을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json({ schedule: getScheduleByAsset(id) ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "자산을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = validateInput(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const schedule = upsertSchedule(id, parsed);
  return NextResponse.json({ schedule });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteScheduleForAsset(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 수동 확인**

```bash
npm run dev
# 자산 하나를 먼저 등록한 뒤 ASSET_ID를 채운다
curl -X PUT localhost:3000/api/assets/ASSET_ID/schedule \
  -H 'Content-Type: application/json' \
  -d '{"frequency":"daily","dayOfWeek":null,"dayOfMonth":null,"timeOfDay":"03:00","enabled":true}'
curl localhost:3000/api/assets/ASSET_ID/schedule
curl -X DELETE localhost:3000/api/assets/ASSET_ID/schedule
```

각 응답이 스펙대로(스케줄 생성/조회/삭제) 동작하는지, 잘못된 `frequency`/`timeOfDay`/`dayOfWeek`/`dayOfMonth`를 보내면 400과 한국어 에러 메시지가 오는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/assets/
git commit -m "feat: 자산별 스케줄 CRUD API 추가"
```

---

### Task 10: UI — 자산 상세 스케줄 설정 + 목록 배지

**Files:**
- Create: `src/app/assets/[id]/ScheduleForm.tsx`
- Modify: `src/app/assets/[id]/page.tsx`
- Modify: `src/app/assets/page.tsx`
- Modify: `src/app/runs/page.tsx`

**Interfaces:**
- Consumes: `Schedule`, `ScheduleFrequency` (`@/lib/scheduling/types`), `getScheduleByAsset` (`@/lib/scheduling/store`)

- [ ] **Step 1: 스케줄 폼 (client 컴포넌트)**

```tsx
// src/app/assets/[id]/ScheduleForm.tsx
"use client";

import { useState } from "react";
import type { Schedule, ScheduleFrequency } from "@/lib/scheduling/types";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function ScheduleForm({
  assetId,
  initialSchedule,
}: {
  assetId: string;
  initialSchedule: Schedule | null;
}) {
  const [frequency, setFrequency] = useState<ScheduleFrequency>(initialSchedule?.frequency ?? "daily");
  const [dayOfWeek, setDayOfWeek] = useState(initialSchedule?.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(initialSchedule?.dayOfMonth ?? 1);
  const [timeOfDay, setTimeOfDay] = useState(initialSchedule?.timeOfDay ?? "03:00");
  const [enabled, setEnabled] = useState(initialSchedule?.enabled ?? true);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/assets/${assetId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frequency,
        dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
        timeOfDay,
        enabled,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "저장 실패" }));
      setError(body.error ?? "저장 실패");
      return;
    }
    const body = await res.json();
    setSchedule(body.schedule);
  }

  async function remove() {
    setSaving(true);
    await fetch(`/api/assets/${assetId}/schedule`, { method: "DELETE" });
    setSaving(false);
    setSchedule(null);
  }

  return (
    <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-4">
      <h2 className="mb-3 text-sm font-bold">정기 점검</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
          className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1"
        >
          <option value="daily">매일</option>
          <option value="weekly">매주</option>
          <option value="monthly">매월</option>
        </select>
        {frequency === "weekly" && (
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1"
          >
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={index} value={index}>
                {label}요일
              </option>
            ))}
          </select>
        )}
        {frequency === "monthly" && (
          <select
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}일
              </option>
            ))}
          </select>
        )}
        <input
          type="time"
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(e.target.value)}
          className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1"
        />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          활성화
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1 text-white disabled:opacity-50"
        >
          저장
        </button>
        {schedule && (
          <button
            onClick={remove}
            disabled={saving}
            className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-3 py-1 disabled:opacity-50"
          >
            스케줄 삭제
          </button>
        )}
      </div>
      {error && <p className="text-xs text-[var(--color-fail)]">{error}</p>}
      {schedule && (
        <p className="text-xs text-[var(--color-muted)]">
          다음 실행: {schedule.nextRunAt.replace("T", " ").slice(0, 16)}
          {schedule.lastRunAt && ` · 마지막 실행: ${schedule.lastRunAt.replace("T", " ").slice(0, 16)}`}
          {schedule.lastSkipReason && ` · 최근 건너뜀: ${schedule.lastSkipReason}`}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 자산 상세 페이지에 섹션 추가**

`src/app/assets/[id]/page.tsx`에 import 추가:

```ts
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { ScheduleForm } from "./ScheduleForm";
```

`const runs = listRuns()...` 다음 줄에 추가:

```ts
const schedule = getScheduleByAsset(id) ?? null;
```

`<h2 className="mb-2 text-sm font-bold">점검 이력</h2>` 바로 위에 추가:

```tsx
<div className="mb-6">
  <ScheduleForm assetId={id} initialSchedule={schedule} />
</div>
```

- [ ] **Step 3: 자산 목록에 배지 열 추가**

`src/app/assets/page.tsx`에 import 추가:

```ts
import { getScheduleByAsset } from "@/lib/scheduling/store";
```

테이블 헤더 `<th className="py-2">등록일</th>` 뒤에 추가:

```tsx
<th className="py-2">정기 점검</th>
```

각 행에 `<td className="py-2 font-mono text-xs text-[var(--color-muted)]">{asset.createdAt}</td>` 뒤에 추가:

```tsx
<td className="py-2 text-xs">
  {(() => {
    const schedule = getScheduleByAsset(asset.id);
    if (!schedule || !schedule.enabled) return "—";
    return schedule.frequency === "daily" ? "매일" : schedule.frequency === "weekly" ? "매주" : "매월";
  })()}
</td>
```

- [ ] **Step 4: 점검 이력에 트리거 배지 추가**

**[병합 후 보정]** `src/app/runs/page.tsx`의 실제 테이블은 `<th ...>상태</th>` 한 줄짜리가 아니라 여러 줄로 펼쳐진 스타일이다(레포지토리/마지막 점검/심각/높음/중간/낮음/상태 순). 아래 두 앵커에 맞춰 추가한다.

테이블 헤더의 "낮음" `<th>`와 "상태" `<th>` 사이에 삽입:

```tsx
                <th className="px-2.5 py-2.5 text-center font-mono text-[11px] text-[var(--color-muted)] uppercase">
                  낮음
                </th>
                <th className="px-2.5 py-2.5 text-center font-mono text-[11px] text-[var(--color-muted)] uppercase">
                  트리거
                </th>
                <th className="px-3.5 py-2.5 font-mono text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
                  상태
                </th>
```

각 행의 "낮음" `<td>`와 상태 `<td>`(상태 뱃지 `<span>`을 담은 것) 사이에 삽입:

```tsx
                    <td className="px-2.5 py-2.5 text-center font-mono text-[var(--color-muted)]">
                      {summary.severityCounts.Low || "—"}
                    </td>
                    <td className="px-2.5 py-2.5 text-center font-mono text-[11px] text-[var(--color-muted)]">
                      {run.triggerType === "scheduled" ? "예약" : "수동"}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
```

(마지막 `<td className="px-3.5 py-2.5">` + `<span ...>` 두 줄은 기존 코드 그대로이며, 에디터가 정확한 위치를 찾기 위한 컨텍스트로만 포함했다.)

- [ ] **Step 5: 수동 확인**

`npm run dev` → `/assets/[id]`에서 "매일/03:00" 스케줄 저장 → `/assets` 목록에 "매일" 배지 확인 → 스케줄 삭제 후 "—"로 바뀌는지 확인 → Task 8에서 만든 예약 run이 `/runs`에 "예약" 배지로 표시되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/app/assets/ src/app/runs/page.tsx
git commit -m "feat: 자산 상세 정기 점검 설정 UI 및 목록 배지 추가"
```

---

## Self-Review 메모

- **스펙 커버리지**: 데이터 모델(Task 1,4) · 아키텍처/캐치업/충돌 skip(Task 6,7,8) · UI(Task 9,10) · 엣지케이스(자산 삭제 cascade: Task 5 / 월말 클램프: Task 2 / 진행 중 run skip: Task 6,7 / 자산 없음 방어: Task 7) · 테스트 전략(각 Task의 단위/통합 테스트) 모두 태스크로 매핑됨. 이메일 알림은 스펙에서 제외됐으므로 태스크 없음.
- **`createRun` 시그니처 불변**: A1/A2가 이미 만든 모든 `createRun`/`scanServerAsset` 호출부를 건드리지 않기 위해, `triggerType`은 생성 후 `markRunTriggerType`으로 별도 마킹하는 방식을 택했다(Task 3, 6). A1/A2 플랜에 없던 새로운 수정 지점이므로 실행자는 실제 코드가 계획과 정확히 일치하는지 Task 3 Step 1에서 먼저 확인해야 한다.
- **DI 패턴 일관성**: `orchestrator.ts`의 `PipelineDeps`, `sandboxTimeout.ts`의 `SandboxTimeoutDeps`와 동일하게 `TriggerDeps`(Task 6), `SchedulerDeps`(Task 7)를 도입해 실제 Docker/SSH 파이프라인 없이 단위 테스트가 가능하도록 했다.
- **N+1 조회**: `/assets` 목록(Task 10 Step 3)에서 자산마다 `getScheduleByAsset`을 개별 호출한다. 로컬 단일 사용자 MVP 규모(수십~수백 자산)에서는 무시할 수준이라 별도 배치 조회 함수를 추가하지 않았다. 규모가 커지면 `listSchedulesByAssetIds` 같은 배치 함수로 후속 개선한다.
- **타임존**: 모든 시각 계산은 서버 프로세스의 로컬 시각 기준이다(스펙의 "단일 로컬 프로세스 MVP" 전제와 동일). 여러 인스턴스·타임존을 넘나드는 배포는 스코프 밖이다.
- **미확정 사항**: Task 8의 `instrumentation.ts`가 Next.js 16.2.9에서 별도 `experimental.instrumentationHook` 설정 없이 안정적으로 동작한다고 가정했다. 실행 시점에 `register()`가 호출되지 않으면 `next.config.ts`에 해당 플래그가 필요한지 Next.js 16 문서를 재확인한다.
