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
