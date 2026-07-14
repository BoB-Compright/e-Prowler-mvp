import { describe, expect, it } from "vitest";
import { osUnixPack } from "./osUnix";
import { containerPack } from "./container";
import { getCatalogByCategory } from "@/lib/catalog";

describe("baseline packs", () => {
  it("osUnix covers exactly the unix catalog ids and probes OS presence", () => {
    const unixIds = getCatalogByCategory("unix").map((i) => i.id).sort();
    expect(osUnixPack.itemIds.slice().sort()).toEqual(unixIds);
    // OS 감지 evidence 태스크 1개(이미지 autodetect에서 U-* 게이팅용).
    expect(osUnixPack.evidenceTasks.map((t) => t.name)).toEqual(["os detection (internal)"]);
    // OS 증거가 없으면 미탐지(autodetect 모드에서만 평가에 사용됨 — declared/서버는 baseline 항상 평가).
    expect(osUnixPack.detect([])).toBe(false);
    expect(osUnixPack.detect([{ taskName: "os detection (internal)", stdout: "Linux" }])).toBe(true);
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
