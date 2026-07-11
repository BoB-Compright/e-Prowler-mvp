import { describe, expect, it } from "vitest";
import { ASSET_CATEGORIES, CATEGORY_VENDORS, isValidCategory } from "./categories";

describe("asset categories", () => {
  it("OS/WEB/WAS/DB 4종을 고정 순서로 제공한다", () => {
    expect(ASSET_CATEGORIES).toEqual(["OS", "WEB", "WAS", "DB"]);
  });

  it("각 종류는 최소 1개 이상의 제조사 기본값을 가진다", () => {
    for (const c of ASSET_CATEGORIES) {
      expect(CATEGORY_VENDORS[c].length).toBeGreaterThan(0);
    }
  });

  it("대표 제조사가 올바른 종류에 매핑돼 있다", () => {
    expect(CATEGORY_VENDORS.WAS).toContain("Tomcat");
    expect(CATEGORY_VENDORS.DB).toContain("Oracle");
    expect(CATEGORY_VENDORS.WEB).toContain("Nginx");
    expect(CATEGORY_VENDORS.OS).toContain("Ubuntu");
  });

  it("isValidCategory는 유효한 종류만 통과시킨다", () => {
    expect(isValidCategory("DB")).toBe(true);
    expect(isValidCategory("os")).toBe(false);
    expect(isValidCategory("")).toBe(false);
    expect(isValidCategory(null)).toBe(false);
  });
});
