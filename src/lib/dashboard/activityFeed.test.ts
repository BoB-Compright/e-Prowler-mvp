import { describe, expect, it } from "vitest";
import { buildActivityFeed, formatRelativeTime } from "./activityFeed";

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-11T12:00:00.000Z");
  it("1분 미만은 '방금 전'", () => {
    expect(formatRelativeTime("2026-07-11T11:59:30.000Z", now)).toBe("방금 전");
  });
  it("1시간 미만은 N분 전", () => {
    expect(formatRelativeTime("2026-07-11T11:55:00.000Z", now)).toBe("5분 전");
  });
  it("24시간 미만은 N시간 전", () => {
    expect(formatRelativeTime("2026-07-11T09:00:00.000Z", now)).toBe("3시간 전");
  });
  it("24시간 이상은 MM-DD HH:mm", () => {
    expect(formatRelativeTime("2026-07-09T09:30:00.000Z", now)).toBe("07-09 09:30");
  });
});

describe("buildActivityFeed", () => {
  it("run과 자산 등록을 시간 역순으로 병합하고 limit으로 자른다", () => {
    const events = buildActivityFeed(
      [
        { runId: "r1", assetName: "server-a", status: "succeeded", failCount: 3, reviewCount: 1, at: "2026-07-11T10:00:00.000Z" },
        { runId: "r2", assetName: "repo-b", status: "running", failCount: null, reviewCount: null, at: "2026-07-11T11:00:00.000Z" },
      ],
      [{ assetId: "a1", assetName: "repo-c", at: "2026-07-11T10:30:00.000Z" }],
      2,
    );
    expect(events.map((e) => e.key)).toEqual(["run-r2", "asset-a1"]);
  });

  it("완료 run은 결과 요약과 tone을 담는다", () => {
    const [vuln] = buildActivityFeed(
      [{ runId: "r1", assetName: "s", status: "succeeded", failCount: 3, reviewCount: 1, at: "2026-07-11T10:00:00.000Z" }],
      [],
    );
    expect(vuln).toMatchObject({ href: "/runs/r1/report", detail: "점검 완료 — 취약 3건 · 검토 1건", tone: "fail" });

    const [clean] = buildActivityFeed(
      [{ runId: "r2", assetName: "s", status: "succeeded", failCount: 0, reviewCount: 0, at: "2026-07-11T10:00:00.000Z" }],
      [],
    );
    expect(clean).toMatchObject({ detail: "점검 완료 — 양호", tone: "pass" });

    const [review] = buildActivityFeed(
      [{ runId: "r3", assetName: "s", status: "succeeded", failCount: 0, reviewCount: 2, at: "2026-07-11T10:00:00.000Z" }],
      [],
    );
    expect(review).toMatchObject({ detail: "점검 완료 — 검토 2건", tone: "review" });
  });

  it("진행/실패/취소/자산 등록 이벤트의 tone·링크", () => {
    const events = buildActivityFeed(
      [
        { runId: "r1", assetName: "s", status: "running", failCount: null, reviewCount: null, at: "2026-07-11T04:00:00.000Z" },
        { runId: "r2", assetName: "s", status: "failed", failCount: null, reviewCount: null, at: "2026-07-11T03:00:00.000Z" },
        { runId: "r3", assetName: "s", status: "cancelled", failCount: null, reviewCount: null, at: "2026-07-11T02:00:00.000Z" },
      ],
      [{ assetId: "a1", assetName: "new-asset", at: "2026-07-11T01:00:00.000Z" }],
    );
    expect(events[0]).toMatchObject({ href: "/runs/r1", detail: "점검 진행 중", tone: "progress" });
    expect(events[1]).toMatchObject({ href: "/runs/r2/report", detail: "점검 실패", tone: "fail" });
    expect(events[2]).toMatchObject({ href: "/runs/r3/report", detail: "점검 취소됨", tone: "neutral" });
    expect(events[3]).toMatchObject({ href: "/assets/a1", detail: "자산 등록", tone: "neutral" });
  });
});
