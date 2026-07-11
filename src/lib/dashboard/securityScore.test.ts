import { describe, expect, it } from "vitest";
import { computeSecurityScore, gradeOf } from "./securityScore";

describe("gradeOf", () => {
  it("구간 경계값", () => {
    expect(gradeOf(100)).toBe("safe");
    expect(gradeOf(90)).toBe("safe");
    expect(gradeOf(89)).toBe("caution");
    expect(gradeOf(70)).toBe("caution");
    expect(gradeOf(69)).toBe("warning");
    expect(gradeOf(40)).toBe("warning");
    expect(gradeOf(39)).toBe("danger");
    expect(gradeOf(0)).toBe("danger");
  });
});

describe("computeSecurityScore", () => {
  it("전부 양호면 100점 safe", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 0, uncheckedAssets: 0,
        criticalHighCheckFindings: 0, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 100, grade: "safe" });
  });

  it("감점 상한이 걸려도 0점 밑으로 내려가지 않는다", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 10, uncheckedAssets: 0,
        criticalHighCheckFindings: 100, criticalHighOpenCves: 100,
      }),
    ).toEqual({ score: 0, grade: "danger" });
  });

  it("취약 1/10(-4), C/H 항목 1(-2)이면 94점", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 1, uncheckedAssets: 0,
        criticalHighCheckFindings: 1, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 94, grade: "safe" });
  });

  it("전부 미점검이면 커버리지 감점만 -10 → 90점", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 0, uncheckedAssets: 10,
        criticalHighCheckFindings: 0, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 90, grade: "safe" });
  });

  it("복합 감점: 100 -10 -6 -3 -2.5 = 78.5 → 79 caution", () => {
    expect(
      computeSecurityScore({
        totalAssets: 4, vulnerableAssets: 1, uncheckedAssets: 1,
        criticalHighCheckFindings: 3, criticalHighOpenCves: 1,
      }),
    ).toEqual({ score: 79, grade: "caution" });
  });

  it("자산 0개는 방어적으로 100 safe (페이지에서는 빈 상태로 처리)", () => {
    expect(
      computeSecurityScore({
        totalAssets: 0, vulnerableAssets: 0, uncheckedAssets: 0,
        criticalHighCheckFindings: 0, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 100, grade: "safe" });
  });
});
