// src/lib/search/match.ts
import type { Asset } from "@/lib/assets/types";
import type { Project } from "@/lib/projects/types";

function includesCaseInsensitive(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

/**
 * Returns true when the asset matches the given free-text query.
 * Matches (case-insensitively, partial match) against display name,
 * repo URL (repo assets), and host IP (server assets).
 * A blank/whitespace-only query matches everything.
 */
export function matchesAssetQuery(asset: Asset, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return (
    includesCaseInsensitive(asset.displayName, normalized) ||
    includesCaseInsensitive(asset.repoUrl, normalized) ||
    includesCaseInsensitive(asset.hostIp, normalized)
  );
}

/**
 * Returns true when the project matches the given free-text query.
 * Matches (case-insensitively, partial match) against the project name.
 * A blank/whitespace-only query matches everything.
 */
export function matchesProjectQuery(project: Project, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return includesCaseInsensitive(project.name, normalized);
}
