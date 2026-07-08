import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listProjects } from "@/lib/projects/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { AssetFilters } from "./AssetFilters";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; type?: string }>;
}) {
  const { projectId, type } = await searchParams;
  const filter: Parameters<typeof listAssets>[0] = {};
  if (projectId) filter.projectId = projectId === "unassigned" ? null : projectId;
  if (type === "repo" || type === "server") filter.type = type;

  const assets = listAssets(filter);
  const projects = listProjects();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">자산 관리</h1>
        <div className="flex gap-2">
          <Link href="/assets/upload" className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-3 py-1.5 text-sm">엑셀 업로드</Link>
          <Link href="/assets/new" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white">자산 등록</Link>
        </div>
      </div>

      <AssetFilters projects={projects} />

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
            <th className="py-2">이름</th><th className="py-2">타입</th><th className="py-2">프로젝트</th><th className="py-2">등록일</th><th className="py-2">정기 점검</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const project = projects.find((p) => p.id === asset.projectId);
            return (
              <tr key={asset.id} className="border-b border-[var(--color-border)]">
                <td className="py-2"><Link href={`/assets/${asset.id}`} className="text-[var(--color-primary)]">{asset.displayName}</Link></td>
                <td className="py-2">{asset.type === "repo" ? "레포" : "서버"}</td>
                <td className="py-2">{project?.name ?? "미분류"}</td>
                <td className="py-2 font-mono text-xs text-[var(--color-muted)]">{asset.createdAt}</td>
                <td className="py-2 text-xs">
                  {(() => {
                    const schedule = getScheduleByAsset(asset.id);
                    if (!schedule || !schedule.enabled) return "—";
                    return schedule.frequency === "daily" ? "매일" : schedule.frequency === "weekly" ? "매주" : "매월";
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
