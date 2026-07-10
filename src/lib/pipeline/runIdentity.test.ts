import { describe, expect, it } from "vitest";
import { runDisplayIdentity } from "./runIdentity";

describe("runDisplayIdentity", () => {
  it("자산이 있으면 자산명을 label, repoUrl을 secondary, assetId를 필터대상으로", () => {
    const m = new Map([["a1", { displayName: "ocpm / backend/Dockerfile" }]]);
    expect(runDisplayIdentity({ repoUrl: "https://github.com/o/ocpm", assetId: "a1" }, m)).toEqual({
      label: "ocpm / backend/Dockerfile",
      secondary: "https://github.com/o/ocpm",
      filterAssetId: "a1",
    });
  });
  it("assetId가 null이면 repoUrl 표시명으로 폴백, 필터대상 없음", () => {
    const r = runDisplayIdentity({ repoUrl: "nginx:alpine", assetId: null }, new Map());
    expect(r.label.length).toBeGreaterThan(0);
    expect(r.secondary).toBe("nginx:alpine");
    expect(r.filterAssetId).toBeNull();
  });
  it("assetId가 있지만 맵에 없으면(삭제된 자산) repoUrl 폴백", () => {
    const r = runDisplayIdentity({ repoUrl: "https://github.com/o/r", assetId: "gone" }, new Map());
    expect(r.filterAssetId).toBeNull();
    expect(r.secondary).toBe("https://github.com/o/r");
  });
});
