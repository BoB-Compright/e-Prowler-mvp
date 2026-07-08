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
