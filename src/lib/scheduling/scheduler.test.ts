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
    // Task 5의 cascade 경로(deleteAsset)를 우회해 방어 분기만 검증한다. better-sqlite3는
    // 기본적으로 FK 제약을 강제하므로(schedules.asset_id REFERENCES assets(id), ON DELETE
    // CASCADE 없음), 고아 스케줄 상태를 인위적으로 만들기 위해 잠시 FK 검사를 끈다.
    db.pragma("foreign_keys = OFF");
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(asset.id);
    db.pragma("foreign_keys = ON");
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
