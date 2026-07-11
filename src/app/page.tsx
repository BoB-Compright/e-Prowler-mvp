import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { listCveMatches } from "@/lib/cve/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import { runProgress } from "@/lib/pipeline/runProgress";
import { computeSecurityScore } from "@/lib/dashboard/securityScore";
import { computeStatusDistribution } from "@/lib/dashboard/statusDistribution";
import { rankRiskyAssets } from "@/lib/dashboard/riskyAssets";
import { buildActivityFeed } from "@/lib/dashboard/activityFeed";
import type { Run } from "@/lib/pipeline/types";
import { LocalImageFallbackForm } from "./LocalImageFallbackForm";
import { AutoRefresh } from "./_components/AutoRefresh";
import { Card } from "./_components/Card";
import { SectionLabel } from "./_components/SectionLabel";
import { StatusBadge } from "./_components/StatusBadge";
import { ASSET_STATUS_BADGE } from "./_components/assetStatusBadge";
import { SecurityScoreGauge } from "./_components/dashboard/SecurityScoreGauge";
import { AssetStatusDonut } from "./_components/dashboard/AssetStatusDonut";
import { ActivityFeedCard } from "./_components/dashboard/ActivityFeedCard";
import { OnboardingTour } from "./_components/onboarding/OnboardingTour";

export default function DashboardPage() {
  const assets = listAssets();
  const allRuns = listRuns(); // 최신순 정렬 보장 (created_at DESC)
  const statusMap = getAssetStatusMap();
  const runById = new Map<string, Run>(allRuns.map((run) => [run.id, run]));

  const rows = assets.map((asset) => {
    const status = statusMap.get(asset.id) ?? { kind: "none" as const };
    const lastRun = status.runId ? runById.get(status.runId) : undefined;
    const summary = lastRun && lastRun.status !== "running" ? getRunRiskSummary(lastRun.id) : null;
    const schedule = getScheduleByAsset(asset.id);
    const openCveCount =
      asset.type === "server"
        ? listCveMatches(asset.id).filter((m) => !m.dismissed).length
        : 0;
    return { asset, status, summary, schedule, openCveCount };
  });

  // KPI (기존 유지)
  const repoCount = assets.filter((a) => a.type === "repo").length;
  const serverCount = assets.length - repoCount;
  const vulnerableCount = rows.filter((row) => row.status.kind === "fail").length;
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

  // 종합 점수 · 분포 · TOP 5
  const criticalHigh = (summary: { severityCounts: Record<string, number> } | null) =>
    summary ? summary.severityCounts.Critical + summary.severityCounts.High : 0;
  const { score, grade } = computeSecurityScore({
    totalAssets: assets.length,
    vulnerableAssets: vulnerableCount,
    uncheckedAssets: rows.filter((row) => row.status.kind === "none").length,
    criticalHighCheckFindings: rows.reduce((sum, row) => sum + criticalHigh(row.summary), 0),
    criticalHighOpenCves: criticalHighCves.length,
  });
  const distribution = computeStatusDistribution(rows.map((row) => row.status.kind));
  const riskyRows = rankRiskyAssets(
    rows.map((row) => ({
      assetId: row.asset.id,
      displayName: row.asset.displayName,
      assetType: row.asset.type,
      statusKind: row.status.kind,
      criticalHigh: criticalHigh(row.summary),
      openCveCount: row.openCveCount,
    })),
  );

  // 활동 피드: 최근 run 20건 + 자산 등록 이벤트를 병합해 10건
  const assetNameById = new Map(assets.map((a) => [a.id, a.displayName]));
  const feedEvents = buildActivityFeed(
    allRuns.slice(0, 20).map((run) => {
      const summary = run.status === "succeeded" ? getRunRiskSummary(run.id) : null;
      return {
        runId: run.id,
        assetName: (run.assetId && assetNameById.get(run.assetId)) ?? getRepoDisplayName(run.repoUrl),
        status: run.status,
        failCount: summary ? summary.statusCounts.fail : null,
        reviewCount: summary ? summary.statusCounts.review : null,
        stageLabel: run.status === "running" ? runProgress(run).label : null,
        at: run.updatedAt,
      };
    }),
    assets.map((a) => ({ assetId: a.id, assetName: a.displayName, at: a.createdAt })),
  );
  const now = new Date();
  // 자산 없는 run(local_image 스캔)도 피드에 표시되므로 run 기준으로 갱신 여부를 판단한다
  const anyRunning = allRuns.some((run) => run.status === "running");

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh active={anyRunning} />
      <OnboardingTour assetCount={assets.length} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">보안 현황 개요</h1>
          <p className="text-[13px] text-muted">전체 자산의 보안 점검 현황 요약</p>
        </div>
        <Link
          href="/assets/new"
          data-tour="asset-register"
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
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 메인 컬럼 (2/3) */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            {/* 1. KPI 스탯 타일 */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
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

            {/* 2. 종합 점수 게이지 + 상태 분포 도넛 */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="종합 보안 점수">
                <SecurityScoreGauge score={score} grade={grade} />
              </Card>
              <Card title="자산 상태 분포">
                <AssetStatusDonut buckets={distribution} total={assets.length} />
              </Card>
            </div>

            {/* 3. 위험 자산 TOP 5 */}
            <Card
              title="위험 자산 TOP 5"
              bodyClassName="p-0"
              action={
                <Link href="/assets" className="text-[13px] font-semibold text-primary hover:underline">
                  전체 자산 보기 →
                </Link>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3"><SectionLabel>자산</SectionLabel></th>
                      <th className="px-5 py-3"><SectionLabel>타입</SectionLabel></th>
                      <th className="px-5 py-3"><SectionLabel>상태</SectionLabel></th>
                      <th className="px-3 py-3 text-center"><SectionLabel>C/H</SectionLabel></th>
                      <th className="px-3 py-3 text-center"><SectionLabel>CVE</SectionLabel></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {riskyRows.map((row) => {
                      const badge = ASSET_STATUS_BADGE[row.statusKind];
                      return (
                        <tr key={row.assetId} className="hover:bg-bg">
                          <td className="px-5 py-3">
                            <Link
                              href={`/assets/${row.assetId}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {row.displayName}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-muted">
                            {row.assetType === "repo" ? "레포" : "서버"}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-[13px]">
                            {row.criticalHigh > 0 ? row.criticalHigh : "—"}
                          </td>
                          <td
                            className={`px-3 py-3 text-center font-mono text-[13px] ${row.openCveCount > 0 ? "text-fail" : ""}`}
                          >
                            {row.assetType === "server" ? row.openCveCount : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 4. 고위험 CVE TOP 5 (기존 유지) */}
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

          {/* 사이드 컬럼 (1/3): 최근 활동 피드 */}
          <div>
            <ActivityFeedCard events={feedEvents} now={now} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <LocalImageFallbackForm />
      </div>
    </main>
  );
}
