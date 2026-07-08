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
