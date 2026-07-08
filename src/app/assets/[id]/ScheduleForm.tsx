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
