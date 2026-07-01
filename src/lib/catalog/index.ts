import containerData from "./data/container.json";
import unixData from "./data/unix.json";
import webData from "./data/web.json";
import type { CatalogItem, Category } from "./types";

type RawItem = Omit<CatalogItem, "category">;

function withCategory(items: RawItem[], category: Category): CatalogItem[] {
  return items.map((item) => ({ ...item, category }));
}

const CATALOG: CatalogItem[] = [
  ...withCategory(containerData as RawItem[], "container"),
  ...withCategory(unixData as RawItem[], "unix"),
  ...withCategory(webData as RawItem[], "web"),
];

export function getCatalog(): CatalogItem[] {
  return CATALOG;
}

export function getCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

export function getCatalogByCategory(category: Category): CatalogItem[] {
  return CATALOG.filter((item) => item.category === category);
}

export interface CatalogSummary {
  total: number;
  byCategory: Record<Category, number>;
  automated: number;
  notAutomated: number;
}

export function getCatalogSummary(): CatalogSummary {
  return {
    total: CATALOG.length,
    byCategory: {
      container: getCatalogByCategory("container").length,
      unix: getCatalogByCategory("unix").length,
      web: getCatalogByCategory("web").length,
    },
    automated: CATALOG.filter((item) => item.automationStatus === "automated").length,
    notAutomated: CATALOG.filter((item) => item.automationStatus === "not_automated").length,
  };
}
