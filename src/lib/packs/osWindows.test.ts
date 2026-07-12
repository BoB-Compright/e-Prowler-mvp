import { describe, expect, it } from "vitest";
import { osWindowsPack } from "./osWindows";
import { evaluatePack } from "./resolve";
import { getCatalogByCategory } from "@/lib/catalog";

describe("osWindowsPack", () => {
  it("is a windows-path pack owning WIN-* items", () => {
    const winIds = getCatalogByCategory("windows").map((i) => i.id).sort();
    expect(osWindowsPack.id).toBe("os-windows");
    expect(osWindowsPack.category).toBe("OS");
    expect(osWindowsPack.vendors).toEqual(["Windows Server"]);
    expect(osWindowsPack.executionPath).toBe("windows");
    expect(osWindowsPack.itemIds.slice().sort()).toEqual(winIds);
  });
  it("evaluatePack returns all WIN-* as review (host pending)", () => {
    const results = evaluatePack(osWindowsPack, { findings: null, tasks: [] });
    expect(results.every((r) => r.status === "review")).toBe(true);
    expect(results[0].evidence).toMatch(/Windows 호스트 연결 대기/);
  });
});
