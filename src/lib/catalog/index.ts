import containerData from "./data/kisa/container.json";
import unixData from "./data/kisa/unix.json";
import webData from "./data/kisa/web.json";
import wasData from "./data/cis/was.json";
import dbData from "./data/cis/db.json";
import windowsData from "./data/cis/windows.json";
import { FRAMEWORKS } from "./frameworks";
import type { CatalogItem, Category, Framework, Mitigation } from "./types";

type RawItem = Omit<CatalogItem, "category" | "frameworkId">;

interface CatalogSource {
  frameworkId: string;
  category: Category;
  data: RawItem[];
}

// Adding a new framework: write its JSON data file(s), register it in
// FRAMEWORKS (./frameworks.ts), then add one entry per category here.
// No other code in this file needs to change.
const CATALOG_SOURCES: CatalogSource[] = [
  { frameworkId: "kisa", category: "container", data: containerData as RawItem[] },
  { frameworkId: "kisa", category: "unix", data: unixData as RawItem[] },
  { frameworkId: "kisa", category: "web", data: webData as RawItem[] },
  { frameworkId: "cis", category: "was", data: wasData as RawItem[] },
  { frameworkId: "cis", category: "db", data: dbData as RawItem[] },
  { frameworkId: "cis", category: "windows", data: windowsData as RawItem[] },
];

const CATALOG: CatalogItem[] = CATALOG_SOURCES.flatMap(({ frameworkId, category, data }) =>
  data.map((item) => ({ ...item, category, frameworkId })),
);

export function getCatalog(): CatalogItem[] {
  return CATALOG;
}

export function getCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

export function getCatalogByCategory(category: Category): CatalogItem[] {
  return CATALOG.filter((item) => item.category === category);
}

export function getFrameworks(): Framework[] {
  return FRAMEWORKS;
}

export interface CatalogSummary {
  total: number;
  byCategory: Record<Category, number>;
  byFramework: Record<string, number>;
  automated: number;
  notAutomated: number;
}

export function getCatalogSummary(): CatalogSummary {
  const byFramework: Record<string, number> = {};
  for (const framework of FRAMEWORKS) {
    byFramework[framework.id] = CATALOG.filter(
      (item) => item.frameworkId === framework.id,
    ).length;
  }

  return {
    total: CATALOG.length,
    byCategory: {
      container: getCatalogByCategory("container").length,
      unix: getCatalogByCategory("unix").length,
      web: getCatalogByCategory("web").length,
      was: getCatalogByCategory("was").length,
      db: getCatalogByCategory("db").length,
      windows: getCatalogByCategory("windows").length,
    },
    byFramework,
    automated: CATALOG.filter((item) => item.automationStatus === "automated").length,
    notAutomated: CATALOG.filter((item) => item.automationStatus === "not_automated").length,
  };
}

export { getMitigation } from "./mitigations";
export type { Mitigation };
