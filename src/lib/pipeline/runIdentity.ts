import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";

export interface RunIdentity {
  label: string;
  secondary: string;
  filterAssetId: string | null;
}

export function runDisplayIdentity(
  run: { repoUrl: string; assetId: string | null },
  assetsById: Map<string, { displayName: string }>,
): RunIdentity {
  const asset = run.assetId ? assetsById.get(run.assetId) : undefined;
  if (asset) {
    return { label: asset.displayName, secondary: run.repoUrl, filterAssetId: run.assetId };
  }
  return { label: getRepoDisplayName(run.repoUrl), secondary: run.repoUrl, filterAssetId: null };
}
