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
