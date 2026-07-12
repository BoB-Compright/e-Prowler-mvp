import { describe, expect, it } from "vitest";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { getCatalogByCategory } from "@/lib/catalog";

describe("baseline packs", () => {
  it("osUnix covers exactly the unix catalog ids and no evidence tasks", () => {
    const unixIds = getCatalogByCategory("unix").map((i) => i.id).sort();
    expect(osUnixPack.itemIds.slice().sort()).toEqual(unixIds);
    expect(osUnixPack.evidenceTasks).toEqual([]);
    expect(osUnixPack.detect([])).toBe(true);
  });
  it("container covers exactly the container catalog ids", () => {
    const cIds = getCatalogByCategory("container").map((i) => i.id).sort();
    expect(containerPack.itemIds.slice().sort()).toEqual(cIds);
  });
  it("osUnix.evaluate returns one result per unix item", () => {
    const results = osUnixPack.evaluate({ findings: null, tasks: [] });
    expect(results.map((r) => r.id).sort()).toEqual(osUnixPack.itemIds.slice().sort());
  });
});
