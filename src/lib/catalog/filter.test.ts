// src/lib/catalog/filter.test.ts
import { describe, expect, it } from "vitest";
import {
  filterCatalog,
  matchesCatalogQuery,
  parseCategoryParam,
  parseModeParam,
  parseComplianceParam,
} from "./filter";
import type { CatalogItem } from "./types";

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "U-16",
    category: "unix",
    frameworkId: "kisa",
    title: "/etc/passwd 파일 소유자 및 권한 설정",
    severity: "High",
    automationStatus: "automated",
    source: { framework: "KISA", ref: "Unix 서버 U-16" },
    ...overrides,
  };
}

describe("matchesCatalogQuery", () => {
  it("returns true for an empty or blank query", () => {
    expect(matchesCatalogQuery(makeItem(), "")).toBe(true);
    expect(matchesCatalogQuery(makeItem(), "   ")).toBe(true);
  });

  it("matches by item id, case-insensitively", () => {
    expect(matchesCatalogQuery(makeItem({ id: "U-16" }), "u-16")).toBe(true);
    expect(matchesCatalogQuery(makeItem({ id: "U-16" }), "u-17")).toBe(false);
  });

  it("matches by title substring, case-insensitively", () => {
    expect(matchesCatalogQuery(makeItem({ title: "Root 로그인 제한" }), "root")).toBe(true);
    expect(matchesCatalogQuery(makeItem({ title: "Root 로그인 제한" }), "nomatch")).toBe(false);
  });

  it("trims surrounding whitespace from the query", () => {
    expect(matchesCatalogQuery(makeItem({ id: "C-01" }), "  c-01  ")).toBe(true);
  });
});

describe("filterCatalog", () => {
  const items: CatalogItem[] = [
    makeItem({ id: "C-01", category: "container", title: "루트 사용자 실행 제한", automationStatus: "automated" }),
    makeItem({ id: "U-16", category: "unix", title: "/etc/passwd 파일 권한 설정", automationStatus: "automated" }),
    makeItem({ id: "U-42", category: "unix", title: "계정 잠금 임계값 설정", automationStatus: "not_automated" }),
    makeItem({ id: "W-26", category: "web", title: "디렉터리 리스팅 취약점", automationStatus: "not_automated" }),
  ];

  it("returns every item when no filter is given", () => {
    expect(filterCatalog(items, {})).toHaveLength(4);
  });

  it("filters by a single category", () => {
    const result = filterCatalog(items, { categories: ["unix"] });
    expect(result.map((i) => i.id)).toEqual(["U-16", "U-42"]);
  });

  it("filters by multiple categories (OR within the group)", () => {
    const result = filterCatalog(items, { categories: ["container", "web"] });
    expect(result.map((i) => i.id)).toEqual(["C-01", "W-26"]);
  });

  it("treats an empty categories array as no category filter", () => {
    expect(filterCatalog(items, { categories: [] })).toHaveLength(4);
  });

  it("filters by automation mode", () => {
    expect(filterCatalog(items, { mode: "automated" }).map((i) => i.id)).toEqual(["C-01", "U-16"]);
    expect(filterCatalog(items, { mode: "manual" }).map((i) => i.id)).toEqual(["U-42", "W-26"]);
  });

  it("filters by free-text query against id and title", () => {
    expect(filterCatalog(items, { query: "passwd" }).map((i) => i.id)).toEqual(["U-16"]);
    expect(filterCatalog(items, { query: "w-26" }).map((i) => i.id)).toEqual(["W-26"]);
  });

  it("combines category, mode, and query filters with AND semantics", () => {
    const result = filterCatalog(items, {
      categories: ["unix"],
      mode: "manual",
      query: "계정",
    });
    expect(result.map((i) => i.id)).toEqual(["U-42"]);

    // Same category + query but the wrong mode should exclude it.
    expect(
      filterCatalog(items, { categories: ["unix"], mode: "automated", query: "계정" }),
    ).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterCatalog(items, { query: "존재하지-않음" })).toEqual([]);
  });

  it("filters by compliance frameworkId (OR within group, AND with others)", () => {
    const item = (id: string, frameworkId: string): CatalogItem => ({
      id,
      category: "web",
      frameworkId,
      title: id,
      severity: "Low",
      automationStatus: "automated",
      source: { framework: frameworkId, ref: id },
    });
    const testItems = [item("A", "kisa"), item("B", "cis")];
    expect(filterCatalog(testItems, { frameworks: ["kisa"] }).map((i) => i.id)).toEqual(["A"]);
    expect(filterCatalog(testItems, { frameworks: ["kisa", "cis"] }).map((i) => i.id)).toEqual([
      "A",
      "B",
    ]);
    expect(filterCatalog(testItems, {}).map((i) => i.id)).toEqual(["A", "B"]);
  });
});

describe("parseCategoryParam", () => {
  it("returns an empty array for undefined", () => {
    expect(parseCategoryParam(undefined)).toEqual([]);
  });

  it("wraps a single valid category string into an array", () => {
    expect(parseCategoryParam("unix")).toEqual(["unix"]);
  });

  it("passes through an array of valid categories", () => {
    expect(parseCategoryParam(["container", "web"])).toEqual(["container", "web"]);
  });

  it("drops unknown values", () => {
    expect(parseCategoryParam(["unix", "bogus"])).toEqual(["unix"]);
    expect(parseCategoryParam("bogus")).toEqual([]);
  });

  it("deduplicates repeated values", () => {
    expect(parseCategoryParam(["unix", "unix"])).toEqual(["unix"]);
  });
});

describe("parseModeParam", () => {
  it("returns undefined for undefined", () => {
    expect(parseModeParam(undefined)).toBeUndefined();
  });

  it("accepts 'automated' and 'manual'", () => {
    expect(parseModeParam("automated")).toBe("automated");
    expect(parseModeParam("manual")).toBe("manual");
  });

  it("returns undefined for unknown values", () => {
    expect(parseModeParam("bogus")).toBeUndefined();
  });

  it("takes the first value when given an array", () => {
    expect(parseModeParam(["manual", "automated"])).toBe("manual");
  });
});

describe("parseComplianceParam", () => {
  it("parseComplianceParam keeps known framework ids, drops junk", () => {
    expect(parseComplianceParam(["kisa", "cis", "bogus"])).toEqual(["kisa", "cis"]);
    expect(parseComplianceParam(undefined)).toEqual([]);
  });
});
