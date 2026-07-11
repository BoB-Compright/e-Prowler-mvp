import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";
import { ShareLinkPanel } from "./ShareLinkPanel";
import { FleetScanButton } from "./FleetScanButton";
import { AutoRefresh } from "../../_components/AutoRefresh";
import { Card } from "../../_components/Card";
import { SectionLabel } from "../../_components/SectionLabel";
import { StatusBadge } from "../../_components/StatusBadge";
import { ASSET_STATUS_BADGE } from "../../_components/assetStatusBadge";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const assets = listAssets({ projectId: id });
  // Fleet 점검은 server(SSH)·repo(이미지 빌드) 자산을 모두 스캔한다(startProjectFleetScan).
  const scannableCount = assets.length;
  const statusMap = getAssetStatusMap();
  const anyRunning = assets.some((a) => statusMap.get(a.id)?.kind === "running");

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

      <Card title={`소속 자산 (${assets.length})`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3">
                  <SectionLabel>이름</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>타입</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>상태</SectionLabel>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((asset) => {
                const badge = ASSET_STATUS_BADGE[statusMap.get(asset.id)?.kind ?? "none"];
                return (
                  <tr key={asset.id} className="hover:bg-bg">
                    <td className="px-5 py-3">
                      <Link
                        href={`/assets/${asset.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {asset.displayName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{asset.type === "repo" ? "레포" : "서버"}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {assets.length === 0 && (
          <p className="p-5 text-[13px] text-muted italic">소속된 자산이 없습니다.</p>
        )}
      </Card>
    </main>
  );
}
