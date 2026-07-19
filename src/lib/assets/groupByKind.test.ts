import { describe, expect, it } from "vitest";
import { firstGroupedAssetId, groupAssetsByKind } from "./groupByKind";

const a = (id: string, kind: "os" | "web" | "was" | "db" | "other") => ({
  id,
  displayName: id,
  kind,
});

describe("groupAssetsByKind", () => {
  it("returns [] for no assets", () => {
    expect(groupAssetsByKind([])).toEqual([]);
  });

  it("groups by kind and excludes empty kinds", () => {
    const groups = groupAssetsByKind([a("1", "db"), a("2", "os"), a("3", "db")]);
    expect(groups.map((g) => g.kind)).toEqual(["os", "db"]); // web/was/other 제외
    expect(groups.find((g) => g.kind === "db")!.assets.map((x) => x.id)).toEqual(["1", "3"]);
    expect(groups.find((g) => g.kind === "os")!.assets.map((x) => x.id)).toEqual(["2"]);
  });

  it("orders kinds OS→WEB→WAS→DB→기타 regardless of input order", () => {
    const groups = groupAssetsByKind([a("x", "other"), a("y", "web"), a("z", "os")]);
    expect(groups.map((g) => g.kind)).toEqual(["os", "web", "other"]);
  });

  it("attaches the Korean label and preserves within-group order", () => {
    const groups = groupAssetsByKind([a("b", "db"), a("a", "db")]);
    expect(groups[0].label).toBe("DB");
    expect(groups[0].assets.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("firstGroupedAssetId", () => {
  it("returns null for no assets", () => {
    expect(firstGroupedAssetId([])).toBeNull();
  });

  it("returns the first asset of the first group in fixed kind order, not input order", () => {
    // "db" 자산이 입력에서 먼저(최신) 오지만, 고정 순서(OS→WEB→WAS→DB→기타)상
    // "os"가 먼저이므로 os 자산의 id를 반환해야 한다.
    const assets = [a("a", "db"), a("b", "os")];
    expect(firstGroupedAssetId(assets)).toBe("b");
  });

  it("returns the first asset id for a single-kind list", () => {
    const assets = [a("x", "web"), a("y", "web")];
    expect(firstGroupedAssetId(assets)).toBe("x");
  });
});
