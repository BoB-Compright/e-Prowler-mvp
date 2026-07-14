import { describe, expect, it } from "vitest";
import { getCatalog, getMitigation } from "./index";

// 모든 카탈로그 항목은 조치 가이드(mitigation)를 가져야 한다. 하나라도 빠지면 공유 리포트에서
// "조치 가이드 준비 중입니다" 폴백이 뜨므로, 신규 벤더 팩 추가 시 mitigations.json 누락을 막는 가드.
describe("mitigation coverage", () => {
  it("모든 카탈로그 항목에 조치 가이드가 존재한다", () => {
    const missing = getCatalog()
      .map((item) => item.id)
      .filter((id) => getMitigation(id) === null);
    expect(missing, `조치 가이드 누락 항목: ${missing.join(", ")}`).toEqual([]);
  });

  it("각 조치 가이드는 risk와 fix를 비어있지 않게 갖는다", () => {
    const bad = getCatalog()
      .map((item) => ({ id: item.id, m: getMitigation(item.id) }))
      .filter(({ m }) => m && (!m.risk.trim() || !m.fix.trim()))
      .map(({ id }) => id);
    expect(bad, `risk/fix가 빈 항목: ${bad.join(", ")}`).toEqual([]);
  });
});
