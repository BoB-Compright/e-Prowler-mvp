import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listProjects } from "@/lib/projects/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { getAssetStatusMap, type AssetStatusKind } from "@/lib/pipeline/assetStatus";
import { matchesAssetQuery } from "@/lib/search/match";
import { AssetFilters } from "./AssetFilters";
import { Card } from "../_components/Card";
import { SectionLabel } from "../_components/SectionLabel";
import { StatusBadge } from "../_components/StatusBadge";
import type { BadgeStatus } from "../_components/statusBadgeStyles";

const STATUS_BADGE: Record<AssetStatusKind, { status: BadgeStatus; label: string }> = {
  pass: { status: "pass", label: "양호" },
  fail: { status: "fail", label: "취약" },
  review: { status: "review", label: "검토" },
  error: { status: "fail", label: "실패" },
  running: { status: "progress", label: "진행 중" },
  cancelled: { status: "neutral", label: "취소됨" },
  none: { status: "neutral", label: "미점검" },
};

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

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">자산 관리</h1>
          <p className="text-[13px] text-muted">등록된 레포지토리·서버 자산을 조회하고 관리합니다</p>
        </div>
        <div className="flex gap-2">
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
                  <SectionLabel>프로젝트</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>등록일</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>정기 점검</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>상태</SectionLabel>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((asset) => {
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
                const badge = STATUS_BADGE[statusMap.get(asset.id)?.kind ?? "none"];
                return (
                  <tr key={asset.id} className="hover:bg-bg">
                    <td className="px-5 py-3">
                      <Link
                        href={`/assets/${asset.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {asset.displayName}
                      </Link>
                      <p className="mt-0.5 font-mono text-[13px] text-muted">
                        {asset.type === "repo" ? asset.repoUrl : `${asset.hostIp}:${asset.sshPort}`}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-muted">{asset.type === "repo" ? "레포" : "서버"}</td>
                    <td className="px-5 py-3">{project?.name ?? "미분류"}</td>
                    <td className="px-5 py-3 font-mono text-[13px] text-muted">{asset.createdAt}</td>
                    <td className="px-5 py-3 text-[13px] text-muted">{scheduleLabel}</td>
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
          <p className="p-5 text-[13px] text-muted italic">조건에 맞는 자산이 없습니다.</p>
        )}
      </Card>
    </main>
  );
}
