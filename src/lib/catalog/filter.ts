// src/lib/catalog/filter.ts
//
// Server-side filtering for /catalog. Filter state lives entirely in the URL
// (?framework=, ?mode=, ?q=) so results are shareable/refreshable — see
// src/app/catalog/page.tsx for how these are parsed from searchParams and
// applied via filterCatalog().
import { FRAMEWORKS } from "./frameworks";
import type { CatalogItem, Category } from "./types";

const CATEGORY_VALUES: Category[] = ["container", "unix", "web", "was", "db"];

// User-facing 자동/수동 filter. Distinct spelling from the underlying
// AutomationStatus ("automated" | "not_automated") because this is the query
// param vocabulary, not the stored data vocabulary.
export type ModeFilter = "automated" | "manual";

export interface CatalogFilterParams {
  // Empty array or undefined = no category filter (matches every category).
  categories?: Category[];
  mode?: ModeFilter;
  query?: string;
  // Empty array or undefined = no framework filter (matches every framework).
  frameworks?: string[];
}

function includesCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/**
 * Returns true when the catalog item matches the given free-text query.
 * Matches (case-insensitively, partial match) against the item id (e.g.
 * U-16/W-26/C-01) and title. A blank/whitespace-only query matches everything.
 */
export function matchesCatalogQuery(item: CatalogItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return (
    includesCaseInsensitive(item.id, normalized) || includesCaseInsensitive(item.title, normalized)
  );
}

/**
 * Filters catalog items by category (multi-select, OR within the group),
 * automation mode (자동/수동), and free-text query — combined with AND
 * semantics across the three groups.
 */
export function filterCatalog(items: CatalogItem[], filter: CatalogFilterParams): CatalogItem[] {
  const { categories, mode, query, frameworks } = filter;

  return items.filter((item) => {
    if (categories && categories.length > 0 && !categories.includes(item.category)) {
      return false;
    }
    if (frameworks && frameworks.length > 0 && !frameworks.includes(item.frameworkId)) {
      return false;
    }
    if (mode === "automated" && item.automationStatus !== "automated") return false;
    if (mode === "manual" && item.automationStatus !== "not_automated") return false;
    if (query && !matchesCatalogQuery(item, query)) return false;
    return true;
  });
}

/**
 * Parses the `?framework=` searchParams value (Next.js gives back a string
 * for one occurrence, string[] for repeated keys, undefined for none) into a
 * de-duplicated list of known Category values, silently dropping anything
 * unrecognized.
 */
export function parseCategoryParam(value: string | string[] | undefined): Category[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const valid = raw.filter((v): v is Category => CATEGORY_VALUES.includes(v as Category));
  return Array.from(new Set(valid));
}

/**
 * Parses the `?mode=` searchParams value into a ModeFilter, or undefined
 * when absent/unrecognized. Mode is single-select, so an array (shouldn't
 * normally happen, but Next.js won't stop a client from crafting one)
 * only considers its first entry.
 */
export function parseModeParam(value: string | string[] | undefined): ModeFilter | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "automated" || first === "manual" ? first : undefined;
}

const FRAMEWORK_IDS = FRAMEWORKS.map((f) => f.id);

/**
 * Parses the `?compliance=` searchParams value (Next.js gives back a string
 * for one occurrence, string[] for repeated keys, undefined for none) into a
 * de-duplicated list of known framework ids, silently dropping anything
 * unrecognized.
 */
export function parseComplianceParam(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(raw.filter((v) => FRAMEWORK_IDS.includes(v))));
}
