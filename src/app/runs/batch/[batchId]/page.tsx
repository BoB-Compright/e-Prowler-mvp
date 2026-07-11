import Link from "next/link";
import { notFound } from "next/navigation";
import { listRunsByBatch } from "@/lib/pipeline/scanBatches";
import { listAssets } from "@/lib/assets/store";
import { runDisplayIdentity } from "@/lib/pipeline/runIdentity";
import { runProgress } from "@/lib/pipeline/runProgress";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { CHECK_STATUS_LABELS } from "@/lib/catalog/types";
import { AutoRefresh } from "../../../_components/AutoRefresh";
import { Card } from "../../../_components/Card";
import { SectionLabel } from "../../../_components/SectionLabel";
import { StatusBadge } from "../../../_components/StatusBadge";
import type { BadgeStatus } from "../../../_components/statusBadgeStyles";

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export default async function BatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const runs = listRunsByBatch(batchId);
  if (runs.length === 0) notFound();

  const assetsById = new Map(listAssets().map((a) => [a.id, a]));
  const runningRuns = runs.filter((run) => run.status === "running");
  const finishedCount = runs.length - runningRuns.length;
  // 전체 진행률 = (종료 run 수 + 진행 중 run들의 부분 진행 합) / 전체
  const overallFraction =
    (finishedCount + runningRuns.reduce((sum, run) => sum + runProgress(run).fraction, 0)) / runs.length;
  const overallPercent = Math.round(overallFraction * 100);

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh active={runningRuns.length > 0} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">일괄 점검 결과</h1>
          <p className="text-[13px] text-muted">
            완료 {finishedCount} / 전체 {runs.length}
            {runningRuns.length > 0 ? ` · ${runningRuns.length}개 진행 중` : ""}
          </p>
        </div>
      </div>

      {runningRuns.length > 0 && (
        <div className="mb-6">
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="font-semibold">전체 진행률</span>
            <span className="font-mono text-muted">{overallPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
      )}

      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3">
                  <SectionLabel>점검 대상</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>진행 단계</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>마지막 갱신</SectionLabel>
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
                const progress = runProgress(run);
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
                    </td>
                    <td className="px-5 py-3">
                      {run.status === "running" ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1 w-24 overflow-hidden rounded-full bg-border">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                            />
                          </span>
                          <span className="text-[13px] text-muted">{progress.label}</span>
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-[13px] text-muted">
                      {formatTimestamp(run.updatedAt)}
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
    </main>
  );
}
