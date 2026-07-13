import { describe, expect, it } from "vitest";
import { getMitigation } from "./mitigations";
import { getCatalog } from "./index";
import mitigationsData from "./data/mitigations.json";

describe("getMitigation", () => {
  it("returns a mitigation for a seeded item", () => {
    const m = getMitigation("U-01");
    expect(m).not.toBeNull();
    expect(m!.risk.length).toBeGreaterThan(0);
    expect(m!.fix.length).toBeGreaterThan(0);
  });

  it("returns null for an item without a mitigation", () => {
    expect(getMitigation("NOPE-999")).toBeNull();
  });

  it("every mitigation key maps to a real catalog item id", () => {
    const ids = new Set(getCatalog().map((c) => c.id));
    // getMitigation의 소스 JSON 키가 실제 카탈로그 항목과 매칭되는지(오탈자 방지).
    const data = mitigationsData as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      expect(ids.has(key)).toBe(true);
    }
  });
});
