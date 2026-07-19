import { describe, expect, it } from "vitest";
import { webNginxPack } from "./webNginx";
import { getCatalogByCategory } from "@/lib/catalog";

const nginxPresent = [{ taskName: "nginx detection (internal)", stdout: "present" }];

describe("webNginxPack", () => {
  it("owns the web catalog ids and the nginx evidence tasks", () => {
    const webIds = getCatalogByCategory("web").filter((i) => i.frameworkId === "kisa").map((i) => i.id).sort();
    expect(webNginxPack.itemIds.slice().sort()).toEqual(webIds);
    expect(webNginxPack.vendors).toEqual(["Nginx"]);
    const names = webNginxPack.evidenceTasks.map((t) => t.name);
    expect(names).toContain("nginx detection (internal)");
    expect(names).toContain("nginx effective config (internal)");
  });
  it("detects nginx from evidence", () => {
    expect(webNginxPack.detect(nginxPresent)).toBe(true);
    expect(webNginxPack.detect([])).toBe(false);
  });
  it("evaluate returns one result per web item", () => {
    const results = webNginxPack.evaluate({ findings: null, tasks: nginxPresent });
    expect(results.map((r) => r.id).sort()).toEqual(webNginxPack.itemIds.slice().sort());
  });
});
