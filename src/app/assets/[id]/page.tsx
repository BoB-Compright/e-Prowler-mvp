import Link from "next/link";
import { notFound } from "next/navigation";
import { getAsset } from "@/lib/assets/store";
import { getProject } from "@/lib/projects/store";
import { listRuns } from "@/lib/pipeline/runs";
import { listCveMatches } from "@/lib/cve/store";
import { CveList } from "./CveList";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { ScheduleForm } from "./ScheduleForm";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { StartScanButton } from "./StartScanButton";

const OUTCOME_COLOR: Record<RunOutcome, string> = {
  fail: "var(--color-fail)",
  review: "var(--color-review)",
  pass: "var(--color-pass)",
};

const OUTCOME_LABEL: Record<RunOutcome, string> = { fail: "취약", review: "검토", pass: "양호" };

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) notFound();

  const project = asset.projectId ? getProject(asset.projectId) : undefined;
  const runs = listRuns().filter((run) => run.assetId === id);
  const schedule = getScheduleByAsset(id) ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            {asset.displayName}
            <span className="rounded-[var(--radius-nh)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-normal text-[var(--color-muted)]">
              {asset.type === "repo" ? "레포" : "서버"}
            </span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {asset.type === "repo" ? asset.repoUrl : `${asset.hostIp}:${asset.sshPort}`}
            {" · "}
            {project ? (
              <Link href={`/projects/${project.id}`} className="text-[var(--color-primary)] hover:underline">
                {project.name}
              </Link>
            ) : (
              "미분류"
            )}
          </p>
        </div>
        <StartScanButton assetId={id} />
      </div>

      <div className="mb-6">
        <ScheduleForm assetId={id} initialSchedule={schedule} />
      </div>
      {asset.type === "server" && (
        <div className="mb-6">
          <CveList matches={listCveMatches(id)} />
        </div>
      )}
      <h2 className="mb-2 text-sm font-bold">점검 이력</h2>
      {runs.length === 0 ? (
        <p className="text-[13px] text-[var(--color-muted)] italic">
          아직 점검 이력이 없습니다 — 우측 상단의 점검 시작 버튼으로 첫 점검을 실행하세요.
        </p>
      ) : (
        <ul className="text-sm">
          {runs.map((run) => {
            const summary = getRunRiskSummary(run.id);
            const outcome = overallRunOutcome(summary);
            const color = OUTCOME_COLOR[outcome];
            return (
              <li key={run.id} className="border-b border-[var(--color-border)]">
                <Link
                  href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                  className="flex items-center gap-3 py-2 hover:bg-[var(--color-surface)]"
                >
                  <span className="font-mono text-xs text-[var(--color-muted)]">
                    {formatTimestamp(run.createdAt)}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {run.triggerType === "scheduled" ? "예약" : "수동"}
                  </span>
                  {run.status === "running" ? (
                    <span className="text-[11.5px] font-semibold text-[var(--color-primary)]">진행 중</span>
                  ) : run.status === "failed" ? (
                    <span className="text-[11.5px] font-semibold text-[var(--color-fail)]">실패</span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                    >
                      {OUTCOME_LABEL[outcome]}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs text-[var(--color-muted)]">
                    C {summary.severityCounts.Critical} · H {summary.severityCounts.High}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
