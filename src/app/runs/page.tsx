import Link from "next/link";
import { listRuns } from "@/lib/pipeline/runs";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import { listAssets } from "@/lib/assets/store";
import { runDisplayIdentity } from "@/lib/pipeline/runIdentity";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { CHECK_STATUS_LABELS } from "@/lib/catalog/types";
import { Card } from "../_components/Card";
import { SectionLabel } from "../_components/SectionLabel";
import { StatusBadge } from "../_components/StatusBadge";
import type { BadgeStatus } from "../_components/statusBadgeStyles";

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; asset?: string }>;
}) {
  const { repo, asset } = await searchParams;
  const allRuns = listRuns();
  const runs = asset
    ? allRuns.filter((run) => run.assetId === asset)
    : repo
      ? allRuns.filter((run) => run.repoUrl === repo)
      : allRuns;
  const assetsById = new Map(listAssets().map((a) => [a.id, a]));

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">점검 이력</h1>
          <p className="text-[13px] text-muted">자산별 최근 점검 결과 · 심각도 요약 비교</p>
        </div>
      </div>

      {(asset || repo) && (
        <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
          <span>
            <span className="font-mono font-bold text-text">
              {asset ? (assetsById.get(asset)?.displayName ?? asset) : getRepoDisplayName(repo!)}
            </span>{" "}
            이력만 표시 중 · {runs.length}건
          </span>
          <Link href="/runs" className="font-semibold text-primary hover:underline">
            전체 보기
          </Link>
        </div>
      )}

      {allRuns.length === 0 ? (
        <Card>
          <p className="text-[13px] text-muted italic">
            아직 실행된 점검이 없습니다 — 자산 탭에서 자산을 등록해 첫 점검을 시작하세요.
          </p>
        </Card>
      ) : runs.length === 0 ? (
        <Card>
          <p className="text-[13px] text-muted italic">이 자산에 대한 점검 이력이 없습니다.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3">
                    <SectionLabel>점검 대상</SectionLabel>
                  </th>
                  <th className="px-5 py-3">
                    <SectionLabel>마지막 점검</SectionLabel>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SectionLabel>심각</SectionLabel>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SectionLabel>높음</SectionLabel>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SectionLabel>중간</SectionLabel>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SectionLabel>낮음</SectionLabel>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SectionLabel>트리거</SectionLabel>
                  </th>
                  <th className="px-5 py-3">
                    <SectionLabel>상태</SectionLabel>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((run) => {
                  const summary = getRunRiskSummary(run.id);
                  const outcome: RunOutcome = overallRunOutcome(summary);
                  const id = runDisplayIdentity(run, assetsById);
                  const badge: { status: BadgeStatus; label: string } =
                    run.status === "running"
                      ? { status: "progress", label: "진행 중" }
                      : run.status === "cancelled"
                        ? { status: "neutral", label: "취소됨" }
                        : run.status === "failed"
                          ? { status: "fail", label: "실패" }
                          : { status: outcome, label: CHECK_STATUS_LABELS[outcome] };
                  return (
                    <tr key={run.id} className="hover:bg-bg">
                      <td className="px-5 py-3">
                        <Link
                          href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                          className="font-mono font-bold hover:underline"
                        >
                          {id.label}
                        </Link>
                        {id.filterAssetId ? (
                          <Link
                            href={`/runs?asset=${id.filterAssetId}`}
                            className="block font-mono text-[13px] text-muted hover:text-primary hover:underline"
                            title="이 자산 이력만 보기"
                          >
                            {id.secondary}
                          </Link>
                        ) : (
                          <Link
                            href={`/runs?repo=${encodeURIComponent(run.repoUrl)}`}
                            className="block font-mono text-[13px] text-muted hover:text-primary hover:underline"
                            title="이 자산의 이력만 보기"
                          >
                            {run.repoUrl}
                          </Link>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-[13px] text-muted">
                        {formatTimestamp(run.updatedAt)}
                      </td>
                      <td
                        className={`px-3 py-3 text-center font-mono text-[13px] font-bold ${
                          summary.severityCounts.Critical ? "text-fail" : "text-muted"
                        }`}
                      >
                        {summary.severityCounts.Critical || "—"}
                      </td>
                      <td
                        className={`px-3 py-3 text-center font-mono text-[13px] font-bold ${
                          summary.severityCounts.High ? "text-review" : "text-muted"
                        }`}
                      >
                        {summary.severityCounts.High || "—"}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[13px] text-muted">
                        {summary.severityCounts.Medium || "—"}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[13px] text-muted">
                        {summary.severityCounts.Low || "—"}
                      </td>
                      <td className="px-3 py-3 text-center text-[13px] text-muted">
                        {run.triggerType === "scheduled" ? "예약" : "수동"}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
