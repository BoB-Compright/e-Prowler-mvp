import Link from "next/link";
import { listProjects } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { type RunOutcome } from "@/lib/checks/riskSummary";
import { getAssetStatusMap, type AssetStatusKind } from "@/lib/pipeline/assetStatus";
import { matchesProjectQuery } from "@/lib/search/match";
import { ProjectsToolbar } from "./ProjectsToolbar";
import { ProjectCardMenu } from "./ProjectCardMenu";
import { Card } from "../_components/Card";
import { StatusBadge } from "../_components/StatusBadge";

const OUTCOME_LABEL: Record<RunOutcome, string> = { fail: "취약", review: "검토", pass: "양호" };

type AssetSummaryStatus = RunOutcome | "neutral" | "progress" | "error" | "cancelled";

const KIND_TO_SUMMARY_STATUS: Record<AssetStatusKind, AssetSummaryStatus> = {
  pass: "pass",
  fail: "fail",
  review: "review",
  error: "error",
  running: "progress",
  cancelled: "cancelled",
  none: "neutral",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q ?? "";
  const allProjects = listProjects();
  const projects = allProjects.filter((project) => matchesProjectQuery(project, query));
  const assets = listAssets();
  const statusMap = getAssetStatusMap();

  function outcomeForAsset(assetId: string): AssetSummaryStatus {
    const status = statusMap.get(assetId);
    return KIND_TO_SUMMARY_STATUS[status?.kind ?? "none"];
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">프로젝트</h1>
        <p className="text-[13px] text-muted">프로젝트별 자산 그룹과 점검 현황을 관리합니다</p>
      </div>

      <ProjectsToolbar />

      {projects.length === 0 ? (
        <Card>
          <p className="text-[13px] text-muted italic">
            {allProjects.length === 0 ? "등록된 프로젝트가 없습니다." : "검색 결과가 없습니다."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {projects.map((project) => {
            const projectAssets = assets.filter((asset) => asset.projectId === project.id);
            const counts: Record<AssetSummaryStatus, number> = {
              pass: 0,
              fail: 0,
              review: 0,
              neutral: 0,
              progress: 0,
              error: 0,
              cancelled: 0,
            };
            for (const asset of projectAssets) {
              counts[outcomeForAsset(asset.id)] += 1;
            }

            return (
              <Card
                key={project.id}
                title={
                  <Link href={`/projects/${project.id}`} className="hover:underline">
                    {project.name}
                  </Link>
                }
                action={
                  <span className="flex items-center gap-3">
                    <span className="text-[13px] text-muted">자산 {projectAssets.length}</span>
                    <ProjectCardMenu
                      projectId={project.id}
                      projectName={project.name}
                      assetCount={projectAssets.length}
                    />
                  </span>
                }
              >
                <p className="text-[13px] text-muted">
                  {project.pmName} · {project.pmEmail}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {projectAssets.length === 0 ? (
                    <span className="text-[13px] text-muted italic">소속 자산 없음</span>
                  ) : (
                    <>
                      {counts.fail > 0 && (
                        <StatusBadge status="fail">{OUTCOME_LABEL.fail} {counts.fail}</StatusBadge>
                      )}
                      {counts.error > 0 && (
                        <StatusBadge status="fail">실패 {counts.error}</StatusBadge>
                      )}
                      {counts.review > 0 && (
                        <StatusBadge status="review">{OUTCOME_LABEL.review} {counts.review}</StatusBadge>
                      )}
                      {counts.pass > 0 && (
                        <StatusBadge status="pass">{OUTCOME_LABEL.pass} {counts.pass}</StatusBadge>
                      )}
                      {counts.progress > 0 && (
                        <StatusBadge status="progress">진행 중 {counts.progress}</StatusBadge>
                      )}
                      {counts.cancelled > 0 && (
                        <StatusBadge status="neutral">취소됨 {counts.cancelled}</StatusBadge>
                      )}
                      {counts.neutral > 0 && (
                        <StatusBadge status="neutral">점검 전 {counts.neutral}</StatusBadge>
                      )}
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
