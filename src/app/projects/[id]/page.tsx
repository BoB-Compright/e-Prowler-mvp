import { notFound } from "next/navigation";
import { getProject, listProjects } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";
import { countRecentCriticalCveAlertsByAsset } from "@/lib/cve/store";
import { classifyAssetKind } from "@/lib/assets/kind";
import { resolveCheckPlan } from "@/lib/packs/resolve";
import { ShareLinkPanel } from "./ShareLinkPanel";
import { FleetScanButton } from "./FleetScanButton";
import { AutoRefresh } from "../../_components/AutoRefresh";
import { Card } from "../../_components/Card";
import { ASSET_STATUS_BADGE } from "../../_components/assetStatusBadge";
import { AssetTable } from "../../assets/AssetTable";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const assets = listAssets({ projectId: id });
  // Fleet 점검은 server(SSH)·repo(이미지 빌드) 자산을 모두 스캔한다(startProjectFleetScan).
  const scannableCount = assets.length;
  const statusMap = getAssetStatusMap();
  // /assets 목록과 동일한 신규 CVE 경보 배지 표시(같은 AssetTable 사용) — 목록 간 불일치 방지.
  const cveAlertCounts = countRecentCriticalCveAlertsByAsset();
  const anyRunning = assets.some((a) => statusMap.get(a.id)?.kind === "running");
  const projects = listProjects();

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh active={anyRunning} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{project.name}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {project.pmName} · {project.pmEmail}
          </p>
        </div>
        <FleetScanButton projectId={project.id} assetCount={scannableCount} />
      </div>

      <div className="mb-6">
        <ShareLinkPanel projectId={project.id} shareToken={project.shareToken} shareStatus={project.shareStatus} />
      </div>

      <Card title={`소속 자산 (${assets.length})`} bodyClassName="p-5">
        {/* /assets 목록과 동일한 체크박스 일괄 선택 UI: 선택한 자산만 일괄 점검·
            프로젝트 이동·정기 점검 설정·삭제할 수 있다(상단 Fleet 점검은 전체 스캔). */}
        <AssetTable
          rows={assets.map((asset) => {
            const proj = projects.find((p) => p.id === asset.projectId);
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
              kind: classifyAssetKind(asset),
              scanCategories: [...new Set(resolveCheckPlan(asset).packs.map((p) => p.category))],
              projectName: proj?.name ?? "미분류",
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
