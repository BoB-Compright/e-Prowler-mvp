import Link from "next/link";
import { listProjects } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import type { Run } from "@/lib/pipeline/types";
import { ProjectForm } from "./ProjectForm";
import { Card } from "../_components/Card";
import { StatusBadge } from "../_components/StatusBadge";

const OUTCOME_LABEL: Record<RunOutcome, string> = { fail: "취약", review: "검토", pass: "양호" };

type AssetSummaryStatus = RunOutcome | "neutral" | "progress" | "error";

export default async function ProjectsPage() {
  const projects = listProjects();
  const assets = listAssets();
  const allRuns = listRuns(); // 최신순 정렬 보장 (created_at DESC)

  // 자산별 마지막 run (allRuns가 최신순이므로 첫 등장 = 최신)
  const latestRunByAsset = new Map<string, Run>();
  for (const run of allRuns) {
    if (run.assetId && !latestRunByAsset.has(run.assetId)) {
      latestRunByAsset.set(run.assetId, run);
    }
  }

  function outcomeForAsset(assetId: string): AssetSummaryStatus {
    const run = latestRunByAsset.get(assetId);
    if (!run) return "neutral";
    if (run.status === "running") return "progress";
    if (run.status === "failed") return "error";
    return overallRunOutcome(getRunRiskSummary(run.id));
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">프로젝트</h1>
        <p className="text-[13px] text-muted">프로젝트별 자산 그룹과 점검 현황을 관리합니다</p>
      </div>

      <Card title="새 프로젝트" className="mb-6">
        <ProjectForm />
      </Card>

      {projects.length === 0 ? (
        <Card>
          <p className="text-[13px] text-muted italic">등록된 프로젝트가 없습니다.</p>
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
                  <span className="text-[13px] text-muted">자산 {projectAssets.length}</span>
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
