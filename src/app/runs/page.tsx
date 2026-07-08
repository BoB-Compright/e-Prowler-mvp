import Link from "next/link";
import { listRuns } from "@/lib/pipeline/runs";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
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

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string }>;
}) {
  const { repo } = await searchParams;
  const allRuns = listRuns();
  const runs = repo ? allRuns.filter((run) => run.repoUrl === repo) : allRuns;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-3 flex items-baseline gap-2.5">
        <h1 className="text-base font-bold">점검 이력</h1>
        <span className="text-xs text-[var(--color-muted)]">레포별 최근 점검 결과 · 심각도 요약 비교</span>
      </div>

      {repo && (
        <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <span>
            <span className="font-mono font-bold text-[var(--color-text)]">{getRepoDisplayName(repo)}</span>
            {" "}이력만 표시 중 · {runs.length}건
          </span>
          <Link href="/runs" className="font-semibold text-[var(--color-primary)] hover:underline">
            전체 보기
          </Link>
        </div>
      )}

      {allRuns.length === 0 ? (
        <p className="text-[13px] text-[var(--color-muted)] italic">
          아직 실행된 점검이 없습니다 — 점검 실행 탭에서 레포 URL을 입력해 첫 점검을 시작하세요.
        </p>
      ) : runs.length === 0 ? (
        <p className="text-[13px] text-[var(--color-muted)] italic">이 레포에 대한 점검 이력이 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--color-surface)] text-left">
                <th className="px-3.5 py-2.5 font-mono text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
                  레포지토리
                </th>
                <th className="px-3.5 py-2.5 font-mono text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
                  마지막 점검
                </th>
                <th className="px-2.5 py-2.5 text-center font-mono text-[11px] text-[var(--color-fail)] uppercase">
                  심각
                </th>
                <th className="px-2.5 py-2.5 text-center font-mono text-[11px] text-[var(--color-review)] uppercase">
                  높음
                </th>
                <th className="px-2.5 py-2.5 text-center font-mono text-[11px] text-[var(--color-muted)] uppercase">
                  중간
                </th>
                <th className="px-2.5 py-2.5 text-center font-mono text-[11px] text-[var(--color-muted)] uppercase">
                  낮음
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
                const color = OUTCOME_COLOR[outcome];
                return (
                  <tr
                    key={run.id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                  >
                    <td className="px-3.5 py-2.5">
                      <Link
                        href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                        className="font-mono font-bold hover:underline"
                      >
                        {getRepoDisplayName(run.repoUrl)}
                      </Link>
                      <Link
                        href={`/runs?repo=${encodeURIComponent(run.repoUrl)}`}
                        className="block font-mono text-[11px] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:underline"
                        title="이 레포의 이력만 보기"
                      >
                        {run.repoUrl}
                      </Link>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[var(--color-muted)]">
                      {formatTimestamp(run.updatedAt)}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-center font-mono font-bold"
                      style={{ color: summary.severityCounts.Critical ? OUTCOME_COLOR.fail : undefined }}
                    >
                      {summary.severityCounts.Critical || "—"}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-center font-mono font-bold"
                      style={{ color: summary.severityCounts.High ? OUTCOME_COLOR.review : undefined }}
                    >
                      {summary.severityCounts.High || "—"}
                    </td>
                    <td className="px-2.5 py-2.5 text-center font-mono text-[var(--color-muted)]">
                      {summary.severityCounts.Medium || "—"}
                    </td>
                    <td className="px-2.5 py-2.5 text-center font-mono text-[var(--color-muted)]">
                      {summary.severityCounts.Low || "—"}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                        {run.status === "running" ? "진행 중" : CHECK_STATUS_LABELS[outcome]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
