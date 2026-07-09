import Link from "next/link";
import { notFound } from "next/navigation";
import { listRunsByBatch } from "@/lib/pipeline/scanBatches";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { CHECK_STATUS_LABELS } from "@/lib/catalog/types";
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

  const runningCount = runs.filter((run) => run.status === "running").length;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">서버 일괄 점검 결과</h1>
          <p className="text-[13px] text-muted">
            서버 {runs.length}대
            {runningCount > 0 ? ` · ${runningCount}대 진행 중` : ""}
          </p>
        </div>
      </div>

      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3">
                  <SectionLabel>서버</SectionLabel>
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
                const badge: { status: BadgeStatus; label: string } =
                  run.status === "running"
                    ? { status: "progress", label: "진행 중" }
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
                        {run.repoUrl}
                      </Link>
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
