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
