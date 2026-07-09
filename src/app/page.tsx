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
import { Card } from "./_components/Card";
import { SectionLabel } from "./_components/SectionLabel";
import { StatusBadge } from "./_components/StatusBadge";

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
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">보안 현황 개요</h1>
          <p className="text-[13px] text-muted">전체 자산의 보안 점검 현황 요약</p>
        </div>
        <Link
          href="/assets/new"
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          자산 등록
        </Link>
      </div>

      {assets.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <p className="text-sm text-muted">등록된 자산이 없습니다.</p>
            <Link
              href="/assets/new"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              첫 자산 등록하기
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* 1. KPI 스탯 타일 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>총 자산</SectionLabel>
              <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">
                {assets.length}
              </div>
              <div className="mt-1 text-[13px] text-muted">
                레포 {repoCount} · 서버 {serverCount}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>취약 자산</SectionLabel>
              <div
                className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${vulnerableCount > 0 ? "text-fail" : ""}`}
              >
                {vulnerableCount}
              </div>
              <div className="mt-1 text-[13px] text-muted">마지막 점검 결과 취약</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>미해결 CVE</SectionLabel>
              <div
                className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${criticalHighCves.length > 0 ? "text-fail" : ""}`}
              >
                {openCves.length}
              </div>
              <div className="mt-1 text-[13px] text-muted">
                Critical·High {criticalHighCves.length}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <SectionLabel>활성 스케줄</SectionLabel>
              <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">
                {activeScheduleCount}
              </div>
              <div className="mt-1 text-[13px] text-muted">정기 점검 자산</div>
            </div>
          </div>

          {/* 2. 자산 보안 상태 / 고위험 CVE TOP 5 */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card title="자산 보안 상태" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3">
                        <SectionLabel>자산</SectionLabel>
                      </th>
                      <th className="px-5 py-3">
                        <SectionLabel>타입</SectionLabel>
                      </th>
                      <th className="px-5 py-3">
                        <SectionLabel>마지막 점검</SectionLabel>
                      </th>
                      <th className="px-3 py-3 text-center">
                        <SectionLabel>C/H</SectionLabel>
                      </th>
                      <th className="px-3 py-3 text-center">
                        <SectionLabel>정기 점검</SectionLabel>
                      </th>
                      <th className="px-3 py-3 text-center">
                        <SectionLabel>CVE</SectionLabel>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map(({ asset, lastRun, summary, outcome, schedule, openCveCount }) => (
                      <tr key={asset.id} className="hover:bg-bg">
                        <td className="px-5 py-3">
                          <Link
                            href={`/assets/${asset.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {asset.displayName}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {asset.type === "repo" ? "레포" : "서버"}
                        </td>
                        <td className="px-5 py-3">
                          {!lastRun ? (
                            <span className="text-[13px] text-muted italic">점검 이력 없음</span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[13px] text-muted">
                                {formatTimestamp(lastRun.updatedAt)}
                              </span>
                              {lastRun.status === "running" ? (
                                <StatusBadge status="progress">진행 중</StatusBadge>
                              ) : lastRun.status === "failed" ? (
                                <StatusBadge status="fail">실패</StatusBadge>
                              ) : outcome ? (
                                <StatusBadge status={outcome}>{OUTCOME_LABEL[outcome]}</StatusBadge>
                              ) : null}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-[13px]">
                          {summary
                            ? `${summary.severityCounts.Critical}/${summary.severityCounts.High}`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-center text-[13px] text-muted">
                          {schedule?.enabled ? SCHEDULE_LABEL[schedule.frequency] : "—"}
                        </td>
                        <td
                          className={`px-3 py-3 text-center font-mono text-[13px] ${openCveCount ? "text-fail" : ""}`}
                        >
                          {openCveCount == null ? "—" : openCveCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="고위험 CVE TOP 5" bodyClassName={topCves.length === 0 ? "p-5" : "p-0"}>
              {topCves.length === 0 ? (
                <p className="text-[13px] text-muted italic">위험 CVE 없음</p>
              ) : (
                <ul className="divide-y divide-border">
                  {topCves.map((cve) => (
                    <li key={cve.id}>
                      <Link
                        href={`/assets/${cve.assetId}`}
                        className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg"
                      >
                        <span className="font-mono text-[13px] font-bold text-fail">{cve.cveId}</span>
                        <span className="text-muted">{cve.assetName}</span>
                        <span className="font-mono text-[13px] text-muted">
                          {cve.packageName}@{cve.packageVersion}
                        </span>
                        <span className="ml-auto font-mono text-[13px] font-bold">
                          {cve.cvssScore != null ? `CVSS ${cve.cvssScore.toFixed(1)}` : cve.severity.toUpperCase()}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* 3. 최근 점검 활동 */}
          <Card title="최근 활동 피드" className="mt-6" bodyClassName="p-0">
            {recentRuns.length === 0 ? (
              <p className="p-5 text-[13px] text-muted italic">아직 실행된 점검이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentRuns.map((run) => {
                  const badge =
                    run.status === "failed"
                      ? { status: "fail" as const, label: "실패" }
                      : run.status === "running"
                        ? { status: "progress" as const, label: "진행 중" }
                        : { status: "pass" as const, label: "완료" };
                  return (
                    <li key={run.id}>
                      <Link
                        href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                        className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg"
                      >
                        <span className="font-semibold">
                          {(run.assetId && assetNameById.get(run.assetId)) ?? getRepoDisplayName(run.repoUrl)}
                        </span>
                        <span className="text-[13px] text-muted">
                          {run.triggerType === "scheduled" ? "예약" : "수동"}
                        </span>
                        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                        <span className="ml-auto font-mono text-[13px] text-muted">
                          {formatTimestamp(run.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <div className="mt-6">
        <LocalImageFallbackForm />
      </div>
    </main>
  );
}
