import Link from "next/link";
import { notFound } from "next/navigation";
import { listRunsByBatch } from "@/lib/pipeline/scanBatches";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { CHECK_STATUS_LABELS } from "@/lib/catalog/types";

const OUTCOME_COLOR: Record<RunOutcome, string> = {
  fail: "var(--color-fail)",
  review: "var(--color-review)",
  pass: "var(--color-pass)",
};

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
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-3 flex items-baseline gap-2.5">
        <h1 className="text-base font-bold">서버 일괄 점검 결과</h1>
        <span className="text-xs text-[var(--color-muted)]">
          서버 {runs.length}대
          {runningCount > 0 ? ` · ${runningCount}대 진행 중` : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--color-surface)] text-left">
              <th className="px-3.5 py-2.5 font-mono text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
                서버
              </th>
              <th className="px-3.5 py-2.5 font-mono text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
                마지막 갱신
              </th>
              <th className="px-3.5 py-2.5 font-mono text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
                상태
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const summary = getRunRiskSummary(run.id);
              const outcome = overallRunOutcome(summary);
              const color = run.status === "failed" ? OUTCOME_COLOR.fail : OUTCOME_COLOR[outcome];
              return (
                <tr key={run.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                  <td className="px-3.5 py-2.5">
                    <Link
                      href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                      className="font-mono font-bold hover:underline"
                    >
                      {run.repoUrl}
                    </Link>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[var(--color-muted)]">
                    {formatTimestamp(run.updatedAt)}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                      {run.status === "running"
                        ? "진행 중"
                        : run.status === "failed"
                          ? "실패"
                          : CHECK_STATUS_LABELS[outcome]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
