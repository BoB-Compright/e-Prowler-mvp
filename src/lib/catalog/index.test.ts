import { describe, expect, it } from "vitest";
import { getCatalog, getCatalogItem, getCatalogSummary } from "./index";

describe("catalog", () => {
  it("loads all 103 items across the three categories", () => {
    const summary = getCatalogSummary();
    expect(summary.total).toBe(103);
    expect(summary.byCategory.container).toBe(9);
    expect(summary.byCategory.unix).toBe(67);
    expect(summary.byCategory.web).toBe(27);
  });

  it("has no duplicate ids", () => {
    const ids = getCatalog().map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds a known item by id and assigns its category", () => {
    expect(getCatalogItem("C-01")).toMatchObject({
      category: "container",
      severity: "High",
    });
    expect(getCatalogItem("U-16")).toMatchObject({
      category: "unix",
      title: "/etc/passwd 파일 소유자 및 권한 설정",
    });
    expect(getCatalogItem("W-27")).toMatchObject({ category: "web" });
    expect(getCatalogItem("does-not-exist")).toBeUndefined();
  });

  it("marks the MVP first-wave items (C-01, C-02, U-16) as automated", () => {
    expect(getCatalogItem("C-01")?.automationStatus).toBe("automated");
    expect(getCatalogItem("C-02")?.automationStatus).toBe("automated");
    expect(getCatalogItem("U-16")?.automationStatus).toBe("automated");
  });
});
