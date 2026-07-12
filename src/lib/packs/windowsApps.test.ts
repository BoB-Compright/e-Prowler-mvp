import { describe, expect, it } from "vitest";
import { webIisPack, dbMssqlPack, wasWeblogicPack, wasWebspherePack } from "./windowsApps";
import { evaluatePack } from "./resolve";
import { getCatalogByCategory } from "@/lib/catalog";

const webIds = () => getCatalogByCategory("web").map((i) => i.id).sort();
const byPrefix = (cat: "db" | "was", p: string) =>
  getCatalogByCategory(cat).map((i) => i.id).filter((id) => id.startsWith(p)).sort();

describe("windows app packs", () => {
  it("web-iis reuses WEB catalog, windows path", () => {
    expect(webIisPack.id).toBe("web-iis");
    expect(webIisPack.category).toBe("WEB");
    expect(webIisPack.vendors).toEqual(["IIS"]);
    expect(webIisPack.executionPath).toBe("windows");
    expect(webIisPack.itemIds.slice().sort()).toEqual(webIds());
  });
  it("db-mssql owns MSSQL-*, was-weblogic WLS-*, was-websphere WSP-*", () => {
    expect(dbMssqlPack.itemIds.slice().sort()).toEqual(byPrefix("db", "MSSQL-"));
    expect(wasWeblogicPack.itemIds.slice().sort()).toEqual(byPrefix("was", "WLS-"));
    expect(wasWebspherePack.itemIds.slice().sort()).toEqual(byPrefix("was", "WSP-"));
  });
  it("all are review-pending via evaluatePack", () => {
    for (const p of [webIisPack, dbMssqlPack, wasWeblogicPack, wasWebspherePack]) {
      const r = evaluatePack(p, { findings: null, tasks: [] });
      expect(r.length).toBe(p.itemIds.length);
      expect(r.every((x) => x.status === "review")).toBe(true);
    }
  });
});
