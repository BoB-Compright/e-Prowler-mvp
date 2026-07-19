import { describe, expect, it } from "vitest";
import { groupAssetsByKind } from "./groupByKind";

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
