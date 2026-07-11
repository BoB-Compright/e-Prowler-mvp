import { describe, expect, it } from "vitest";
import { computeDonutArcs, donutSegmentPath, gaugeArcPath } from "./donutGeometry";

describe("donutSegmentPath", () => {
  it("링 세그먼트 path: M → 외곽 A → L → 내곽 A → Z", () => {
    const d = donutSegmentPath(80, 80, 76, 52, 0, Math.PI / 2);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.match(/A /g)).toHaveLength(2);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("gaugeArcPath", () => {
  it("스트로크용 아크 path: M → A, 닫지 않음", () => {
    const d = gaugeArcPath(100, 100, 80, -2, 2);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("A ");
    expect(d.endsWith("Z")).toBe(false);
  });
});

describe("computeDonutArcs", () => {
  const opts = { cx: 80, cy: 80, rOuter: 76, rInner: 52 };

  it("0건 슬라이스는 건너뛴다", () => {
    const arcs = computeDonutArcs(
      [{ key: "a", value: 2 }, { key: "b", value: 0 }, { key: "c", value: 1 }],
      opts,
    );
    expect(arcs.map((a) => a.key)).toEqual(["a", "c"]);
  });

  it("전체가 0이면 빈 배열", () => {
    expect(computeDonutArcs([{ key: "a", value: 0 }], opts)).toEqual([]);
  });

  it("단일 100% 슬라이스도 퇴화하지 않은 path를 만든다", () => {
    const arcs = computeDonutArcs([{ key: "only", value: 5 }], opts);
    expect(arcs).toHaveLength(1);
    // 시작점과 끝점이 같으면 arc가 사라진다 — 끝각을 TAU 직전으로 클램프했는지 확인
    const [, mx] = arcs[0].d.match(/^M ([\d.-]+) /)!;
    const after = arcs[0].d.split("A ")[1];
    expect(after).toBeDefined();
    expect(Number(mx)).not.toBeNaN();
  });
});
