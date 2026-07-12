import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listProjects } from "@/lib/projects/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";
import { countRecentCriticalCveAlertsByAsset } from "@/lib/cve/store";
import { matchesAssetQuery } from "@/lib/search/match";
import { AssetFilters } from "./AssetFilters";
import { AssetTable } from "./AssetTable";
import { Card } from "../_components/Card";
import { ASSET_STATUS_BADGE } from "../_components/assetStatusBadge";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; type?: string; q?: string }>;
}) {
  const { projectId, type, q } = await searchParams;
  const filter: Parameters<typeof listAssets>[0] = {};
  if (projectId) filter.projectId = projectId === "unassigned" ? null : projectId;
  if (type === "repo" || type === "server") filter.type = type;

  const query = q ?? "";
  const assets = listAssets(filter).filter((asset) => matchesAssetQuery(asset, query));
  const projects = listProjects();
  const statusMap = getAssetStatusMap();
  const cveAlertCounts = countRecentCriticalCveAlertsByAsset();

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">자산 관리</h1>
          <p className="text-[13px] text-muted">등록된 레포지토리·서버 자산을 조회하고 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/assets/import"
            className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
          >
            레포 가져오기
          </Link>
          <Link
            href="/assets/upload"
            className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
          >
            엑셀 업로드
          </Link>
          <Link
            href="/assets/new"
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            자산 등록
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <AssetFilters projects={projects} />
      </div>

      <Card bodyClassName="p-0">
        <AssetTable
          rows={assets.map((asset) => {
            const project = projects.find((p) => p.id === asset.projectId);
            const schedule = getScheduleByAsset(asset.id);
            const scheduleLabel =
              !schedule || !schedule.enabled
                ? "—"
                : schedule.frequency === "daily"
                  ? "매일"
                  : schedule.frequency === "weekly"
                    ? "매주"
                    : "매월";
            const badge = ASSET_STATUS_BADGE[statusMap.get(asset.id)?.kind ?? "none"];
            return {
              id: asset.id,
              displayName: asset.displayName,
              detail: asset.type === "repo" ? (asset.repoUrl ?? "") : `${asset.hostIp}:${asset.sshPort}`,
              typeLabel: asset.type === "repo" ? "레포" : "서버",
              projectName: project?.name ?? "미분류",
              createdAt: asset.createdAt,
              scheduleLabel,
              badgeStatus: badge.status,
              badgeLabel: badge.label,
              newCveAlertCount: cveAlertCounts.get(asset.id) ?? 0,
            };
          })}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </Card>
    </main>
  );
}
