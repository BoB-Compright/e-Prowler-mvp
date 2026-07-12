import { describe, expect, it } from "vitest";
import { getCatalog, getCatalogByCategory, getCatalogItem, getCatalogSummary, getFrameworks } from "./index";

describe("catalog", () => {
  it("loads all 126 items across the five categories", () => {
    const summary = getCatalogSummary();
    expect(summary.total).toBe(126);
    expect(summary.byCategory.container).toBe(9);
    expect(summary.byCategory.unix).toBe(67);
    expect(summary.byCategory.web).toBe(26);
    expect(summary.byCategory.was).toBe(12);
    expect(summary.byCategory.db).toBe(12);
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

  it("registers KISA covering all 102 current items", () => {
    const summary = getCatalogSummary();
    expect(summary.byFramework.kisa).toBe(102);
  });

  it("every catalog item carries a source with framework + ref", () => {
    for (const item of getCatalog()) {
      expect(item.source, item.id).toBeDefined();
      expect(item.source.framework.length).toBeGreaterThan(0);
      expect(item.source.ref.length).toBeGreaterThan(0);
    }
  });

  it("registers KISA and CIS frameworks", () => {
    const ids = getFrameworks().map((f) => f.id);
    expect(ids).toContain("kisa");
    expect(ids).toContain("cis");
  });

  it("has 12 CIS-sourced WAS items", () => {
    const was = getCatalogByCategory("was");
    expect(was).toHaveLength(12);
    expect(was.every((i) => i.frameworkId === "cis")).toBe(true);
    expect(was.every((i) => i.source.framework === "CIS")).toBe(true);
    expect(was.map((i) => i.id)).toContain("WAS-01");
    expect(was.map((i) => i.id)).toContain("WAS-12");
  });

  it("has 12 CIS-sourced DB items", () => {
    const db = getCatalogByCategory("db");
    expect(db).toHaveLength(12);
    expect(db.every((i) => i.frameworkId === "cis")).toBe(true);
    expect(db.map((i) => i.id)).toContain("DB-01");
    expect(db.map((i) => i.id)).toContain("DB-12");
  });
});
