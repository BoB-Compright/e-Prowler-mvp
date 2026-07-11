import { describe, expect, it } from "vitest";
import { computeStatusDistribution } from "./statusDistribution";

describe("computeStatusDistribution", () => {
  it("고정 순서 5개 버킷으로 집계한다", () => {
    expect(
      computeStatusDistribution(["pass", "pass", "fail", "review", "running", "none"]),
    ).toEqual([
      { key: "pass", label: "양호", count: 2 },
      { key: "review", label: "검토", count: 1 },
      { key: "fail", label: "취약", count: 1 },
      { key: "running", label: "진행 중", count: 1 },
      { key: "unchecked", label: "미점검", count: 1 },
    ]);
  });

  it("error/cancelled는 미점검으로 묶인다", () => {
    const buckets = computeStatusDistribution(["error", "cancelled", "none"]);
    expect(buckets.find((b) => b.key === "unchecked")?.count).toBe(3);
  });

  it("빈 입력이면 전부 0건", () => {
    expect(computeStatusDistribution([]).every((b) => b.count === 0)).toBe(true);
  });
});
