import { describe, expect, it } from "vitest";
import { getCatalog, getCatalogByCategory, getCatalogItem, getCatalogSummary, getFrameworks } from "./index";

describe("catalog", () => {
  it("loads all 222 items across the six categories", () => {
    const summary = getCatalogSummary();
    expect(summary.total).toBe(222);
    expect(summary.byCategory.container).toBe(9);
    expect(summary.byCategory.unix).toBe(67);
    expect(summary.byCategory.web).toBe(35);
    expect(summary.byCategory.was).toBe(41);
    expect(summary.byCategory.db).toBe(60);
    expect(summary.byCategory.windows).toBe(10);
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

  it("registers KISA, CIS, and Tmax frameworks", () => {
    const ids = getFrameworks().map((f) => f.id);
    expect(ids).toContain("kisa");
    expect(ids).toContain("cis");
    expect(ids).toContain("tmax");
  });

  it("has 28 CIS-sourced WAS items", () => {
    const was = getCatalogByCategory("was");
    expect(was).toHaveLength(41);
    const cisWas = was.filter((i) => i.frameworkId === "cis");
    expect(cisWas).toHaveLength(28);
    expect(cisWas.every((i) => i.source.framework === "CIS")).toBe(true);
    const jeusWas = was.filter((i) => i.frameworkId === "tmax");
    expect(jeusWas).toHaveLength(13);
    expect(jeusWas.every((i) => i.source.framework === "Tmax")).toBe(true);
    expect(jeusWas.map((i) => i.id)).toContain("JE-01");
    expect(was.map((i) => i.id)).toContain("WAS-01");
    expect(was.map((i) => i.id)).toContain("WAS-12");
  });

  it("has 9 Tmax-sourced WebtoB items in the web category", () => {
    const webtob = getCatalogByCategory("web").filter((i) => i.frameworkId === "tmax");
    expect(webtob).toHaveLength(9);
    expect(webtob.map((i) => i.id)).toContain("WT-01");
    expect(webtob.every((i) => i.source.framework === "Tmax")).toBe(true);
  });

  it("has 46 CIS-sourced DB items (MySQL + PostgreSQL + Oracle + SQL Server) plus 14 Tmax-sourced Tibero items", () => {
    const db = getCatalogByCategory("db");
    expect(db).toHaveLength(60);
    const cisItems = db.filter((i) => i.frameworkId === "cis");
    const tmaxItems = db.filter((i) => i.frameworkId === "tmax");
    expect(cisItems).toHaveLength(46);
    expect(tmaxItems).toHaveLength(14);
    expect(db.map((i) => i.id)).toContain("DB-01");
    expect(db.map((i) => i.id)).toContain("DB-12");
    expect(db.map((i) => i.id)).toContain("PG-01");
    expect(db.map((i) => i.id)).toContain("PG-12");
    expect(db.map((i) => i.id)).toContain("ORA-01");
    expect(db.map((i) => i.id)).toContain("ORA-12");
    expect(db.map((i) => i.id)).toContain("TB-01");
    expect(db.map((i) => i.id)).toContain("TB-12");
    expect(db.map((i) => i.id)).toContain("TB-13");
    expect(db.map((i) => i.id)).toContain("TB-14");
    expect(tmaxItems.every((i) => i.source.framework === "Tmax")).toBe(true);
  });

  it("db category has DB-* (MySQL) + PG-* (PostgreSQL) + ORA-* (Oracle) + MSSQL-* (SQL Server) subsets", () => {
    const ids = getCatalogByCategory("db").map((i) => i.id);
    expect(ids.filter((i) => i.startsWith("DB-"))).toHaveLength(12);
    expect(ids.filter((i) => i.startsWith("PG-"))).toHaveLength(12);
    expect(ids.filter((i) => i.startsWith("ORA-"))).toHaveLength(12);
    expect(ids.filter((i) => i.startsWith("MSSQL-"))).toHaveLength(10);
    expect(ids).toContain("DB-01");
    expect(ids).toContain("DB-12");
    expect(ids).toContain("PG-01");
    expect(ids).toContain("PG-12");
    expect(ids).toContain("ORA-01");
    expect(ids).toContain("ORA-12");
  });

  it("db category has ORA-* (Oracle) 12 items too", () => {
    const ids = getCatalogByCategory("db").map((i) => i.id);
    expect(ids.filter((i) => i.startsWith("ORA-"))).toHaveLength(12);
    expect(ids).toContain("ORA-01");
    expect(ids).toContain("ORA-12");
  });

  it("has 10 CIS-sourced Windows(WIN-*) items in the windows category", () => {
    const win = getCatalogByCategory("windows");
    expect(win).toHaveLength(10);
    expect(win.every((i) => i.frameworkId === "cis")).toBe(true);
    expect(win.map((i) => i.id)).toContain("WIN-01");
  });

  it("db has MSSQL-*, was has WLS-*/WSP-*", () => {
    const db = getCatalogByCategory("db").map((i) => i.id);
    const was = getCatalogByCategory("was").map((i) => i.id);
    expect(db.filter((i) => i.startsWith("MSSQL-"))).toHaveLength(10);
    expect(was.filter((i) => i.startsWith("WLS-"))).toHaveLength(8);
    expect(was.filter((i) => i.startsWith("WSP-"))).toHaveLength(8);
  });
});
