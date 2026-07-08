import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { listCveMatches } from "@/lib/cve/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import type { Run } from "@/lib/pipeline/types";
import { LocalImageFallbackForm } from "./LocalImageFallbackForm";

const OUTCOME_COLOR: Record<RunOutcome, string> = {
  fail: "var(--color-fail)",
  review: "var(--color-review)",
  pass: "var(--color-pass)",
};

const OUTCOME_LABEL: Record<RunOutcome, string> = { fail: "취약", review: "검토", pass: "양호" };

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

const SCHEDULE_LABEL: Record<string, string> = { daily: "매일", weekly: "매주", monthly: "매월" };

export default function DashboardPage() {
  const assets = listAssets();
  const allRuns = listRuns(); // 최신순 정렬 보장 (created_at DESC)

  // 자산별 마지막 run (allRuns가 최신순이므로 첫 등장 = 최신)
  const latestRunByAsset = new Map<string, Run>();
  for (const run of allRuns) {
    if (run.assetId && !latestRunByAsset.has(run.assetId)) {
      latestRunByAsset.set(run.assetId, run);
    }
  }

  const rows = assets.map((asset) => {
    const lastRun = latestRunByAsset.get(asset.id);
    const summary = lastRun && lastRun.status !== "running" ? getRunRiskSummary(lastRun.id) : null;
    const outcome =
      lastRun && lastRun.status === "succeeded" && summary ? overallRunOutcome(summary) : null;
    const schedule = getScheduleByAsset(asset.id);
    const openCveCount =
      asset.type === "server"
        ? listCveMatches(asset.id).filter((m) => !m.dismissed).length
        : null;
    return { asset, lastRun, summary, outcome, schedule, openCveCount };
  });

  const repoCount = assets.filter((a) => a.type === "repo").length;
  const serverCount = assets.length - repoCount;
  const vulnerableCount = rows.filter((row) => row.outcome === "fail").length;
  const activeScheduleCount = rows.filter((row) => row.schedule?.enabled).length;

  const openCves = assets
    .filter((a) => a.type === "server")
    .flatMap((a) =>
      listCveMatches(a.id)
        .filter((m) => !m.dismissed)
        .map((m) => ({ ...m, assetName: a.displayName })),
    );
  const criticalHighCves = openCves.filter(
    (m) => m.severity === "critical" || m.severity === "high",
  );
  const topCves = [...criticalHighCves]
    .sort((x, y) => (y.cvssScore ?? 0) - (x.cvssScore ?? 0))
    .slice(0, 5);

  const recentRuns = allRuns.slice(0, 8);
  const assetNameById = new Map(assets.map((a) => [a.id, a.displayName]));

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">대시보드</h1>
          <p className="text-xs text-[var(--color-muted)]">등록 자산 전체의 보안 현황 요약</p>
        </div>
        <Link
          href="/assets/new"
          className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white"
        >
          자산 등록
        </Link>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">등록된 자산이 없습니다.</p>
          <Link
            href="/assets/new"
            className="mt-3 inline-block rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            첫 자산 등록하기
          </Link>
        </div>
      ) : (
        <>
          {/* 1. 지표 카드 줄 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">총 자산</div>
              <div className="mt-1 text-2xl font-bold">{assets.length}</div>
              <div className="text-xs text-[var(--color-muted)]">레포 {repoCount} · 서버 {serverCount}</div>
            </div>
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">취약 자산</div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{ color: vulnerableCount > 0 ? "var(--color-fail)" : undefined }}
              >
                {vulnerableCount}
              </div>
              <div className="text-xs text-[var(--color-muted)]">마지막 점검 결과 취약</div>
            </div>
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">미해결 CVE</div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{ color: criticalHighCves.length > 0 ? "var(--color-fail)" : undefined }}
              >
                {openCves.length}
              </div>
              <div className="text-xs text-[var(--color-muted)]">Critical·High {criticalHighCves.length}</div>
            </div>
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">활성 스케줄</div>
              <div className="mt-1 text-2xl font-bold">{activeScheduleCount}</div>
              <div className="text-xs text-[var(--color-muted)]">정기 점검 자산</div>
            </div>
          </div>

          {/* 2. 위험 CVE */}
          <section className="mt-8">
            <h2 className="text-sm font-bold">위험 CVE (Critical·High)</h2>
            {topCves.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--color-muted)] italic">위험 CVE 없음</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-nh)] border border-[var(--color-border)]">
                {topCves.map((cve) => (
                  <li key={cve.id}>
                    <Link
                      href={`/assets/${cve.assetId}`}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                    >
                      <span className="font-mono font-bold text-[var(--color-fail)]">{cve.cveId}</span>
                      <span className="text-[var(--color-muted)]">{cve.assetName}</span>
                      <span className="font-mono text-xs text-[var(--color-muted)]">
                        {cve.packageName}@{cve.packageVersion}
                      </span>
                      <span className="ml-auto font-mono text-xs font-bold">
                        {cve.cvssScore != null ? `CVSS ${cve.cvssScore.toFixed(1)}` : cve.severity.toUpperCase()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. 자산별 보안 현황 */}
          <section className="mt-8">
            <h2 className="text-sm font-bold">자산별 보안 현황</h2>
            <div className="mt-2 overflow-hidden rounded-[var(--radius-nh)] border border-[var(--color-border)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
                    <th className="px-3 py-2 font-mono text-[11px] uppercase">자산</th>
                    <th className="px-3 py-2 font-mono text-[11px] uppercase">타입</th>
                    <th className="px-3 py-2 font-mono text-[11px] uppercase">마지막 점검</th>
                    <th className="px-2 py-2 text-center font-mono text-[11px] uppercase">C/H</th>
                    <th className="px-2 py-2 text-center font-mono text-[11px] uppercase">정기 점검</th>
                    <th className="px-2 py-2 text-center font-mono text-[11px] uppercase">CVE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ asset, lastRun, summary, outcome, schedule, openCveCount }) => (
                    <tr key={asset.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                      <td className="px-3 py-2">
                        <Link href={`/assets/${asset.id}`} className="font-semibold text-[var(--color-primary)] hover:underline">
                          {asset.displayName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{asset.type === "repo" ? "레포" : "서버"}</td>
                      <td className="px-3 py-2">
                        {!lastRun ? (
                          <span className="text-xs text-[var(--color-muted)] italic">점검 이력 없음</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs text-[var(--color-muted)]">
                              {formatTimestamp(lastRun.updatedAt)}
                            </span>
                            {lastRun.status === "running" ? (
                              <span className="text-[11px] font-semibold text-[var(--color-primary)]">진행 중</span>
                            ) : lastRun.status === "failed" ? (
                              <span className="text-[11px] font-semibold text-[var(--color-fail)]">실패</span>
                            ) : outcome ? (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background: `color-mix(in srgb, ${OUTCOME_COLOR[outcome]} 16%, transparent)`,
                                  color: OUTCOME_COLOR[outcome],
                                }}
                              >
                                {OUTCOME_LABEL[outcome]}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-xs">
                        {summary ? `${summary.severityCounts.Critical}/${summary.severityCounts.High}` : "—"}
                      </td>
                      <td className="px-2 py-2 text-center text-xs">
                        {schedule?.enabled ? SCHEDULE_LABEL[schedule.frequency] : "—"}
                      </td>
                      <td
                        className="px-2 py-2 text-center font-mono text-xs"
                        style={{ color: openCveCount ? "var(--color-fail)" : undefined }}
                      >
                        {openCveCount == null ? "—" : openCveCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 4. 최근 점검 활동 */}
          <section className="mt-8">
            <h2 className="text-sm font-bold">최근 점검 활동</h2>
            {recentRuns.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--color-muted)] italic">아직 실행된 점검이 없습니다.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-nh)] border border-[var(--color-border)]">
                {recentRuns.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                    >
                      <span className="font-semibold">
                        {(run.assetId && assetNameById.get(run.assetId)) ?? getRepoDisplayName(run.repoUrl)}
                      </span>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        {run.triggerType === "scheduled" ? "예약" : "수동"}
                      </span>
                      <span
                        className="text-[11px] font-semibold"
                        style={{
                          color:
                            run.status === "failed"
                              ? "var(--color-fail)"
                              : run.status === "running"
                                ? "var(--color-primary)"
                                : "var(--color-pass)",
                        }}
                      >
                        {run.status === "running" ? "진행 중" : run.status === "failed" ? "실패" : "완료"}
                      </span>
                      <span className="ml-auto font-mono text-xs text-[var(--color-muted)]">
                        {formatTimestamp(run.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <LocalImageFallbackForm />
    </main>
  );
}
