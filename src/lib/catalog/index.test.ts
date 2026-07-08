import { describe, expect, it } from "vitest";
import { getCatalog, getCatalogItem, getCatalogSummary, getFrameworks } from "./index";

describe("catalog", () => {
  it("loads all 102 items across the three categories", () => {
    const summary = getCatalogSummary();
    expect(summary.total).toBe(102);
    expect(summary.byCategory.container).toBe(9);
    expect(summary.byCategory.unix).toBe(67);
    expect(summary.byCategory.web).toBe(26);
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
    expect(getCatalogItem("WEB-26")).toMatchObject({ category: "web" });
    expect(getCatalogItem("does-not-exist")).toBeUndefined();
  });

  it("marks the MVP first-wave items (C-01, C-02, U-16) as automated", () => {
    expect(getCatalogItem("C-01")?.automationStatus).toBe("automated");
    expect(getCatalogItem("C-02")?.automationStatus).toBe("automated");
    expect(getCatalogItem("U-16")?.automationStatus).toBe("automated");
  });

  it("tags every item with a frameworkId registered in getFrameworks()", () => {
    const registeredIds = new Set(getFrameworks().map((framework) => framework.id));
    for (const item of getCatalog()) {
      expect(registeredIds.has(item.frameworkId)).toBe(true);
    }
  });

  it("registers KISA as the only framework, covering all 102 items", () => {
    const frameworks = getFrameworks();
    expect(frameworks).toHaveLength(1);
    expect(frameworks[0]).toMatchObject({
      id: "kisa",
      name: "KISA 주요정보통신기반시설 가이드",
    });

    const summary = getCatalogSummary();
    expect(summary.byFramework.kisa).toBe(102);
  });
});
