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
import { formatKst } from "@/lib/time/kst";
import { StartScanButton } from "./StartScanButton";
import { Card } from "../../_components/Card";
import { SectionLabel } from "../../_components/SectionLabel";
import { StatusBadge } from "../../_components/StatusBadge";

const OUTCOME_LABEL: Record<RunOutcome, string> = { fail: "취약", review: "검토", pass: "양호" };

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) notFound();

  const project = asset.projectId ? getProject(asset.projectId) : undefined;
  const runs = listRuns().filter((run) => run.assetId === id);
  const schedule = getScheduleByAsset(id) ?? null;

  // 헤더 상태 배지: 가장 최근 점검(runs[0], 최신순 정렬 보장)의 결과를 표시한다.
  const latestRun = runs[0];
  const latestSummary =
    latestRun && latestRun.status !== "running" ? getRunRiskSummary(latestRun.id) : null;
  const latestOutcome =
    latestRun && latestRun.status === "succeeded" && latestSummary
      ? overallRunOutcome(latestSummary)
      : null;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-bold tracking-[-0.02em]">
              {asset.displayName}
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                {asset.type === "repo" ? "레포" : "서버"}
              </span>
              {!latestRun ? (
                <StatusBadge status="neutral">점검 전</StatusBadge>
              ) : latestRun.status === "running" ? (
                <StatusBadge status="progress">진행 중</StatusBadge>
              ) : latestRun.status === "cancelled" ? (
                <StatusBadge status="neutral">취소됨</StatusBadge>
              ) : latestRun.status === "failed" ? (
                <StatusBadge status="fail">실패</StatusBadge>
              ) : latestOutcome ? (
                <StatusBadge status={latestOutcome}>{OUTCOME_LABEL[latestOutcome]}</StatusBadge>
              ) : null}
            </h1>
            <p className="mt-1 text-[13px] text-muted">
              <span className="font-mono">
                {asset.type === "repo" ? asset.repoUrl : `${asset.hostIp}:${asset.sshPort}`}
              </span>
              {" · "}
              {project ? (
                <Link href={`/projects/${project.id}`} className="text-primary hover:underline">
                  {project.name}
                </Link>
              ) : (
                "미분류"
              )}
            </p>
          </div>
          <StartScanButton assetId={id} />
        </div>

        <Card title="자산 정보" className="mb-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt>
                <SectionLabel>자산 ID</SectionLabel>
              </dt>
              <dd className="mt-1 font-mono text-[13px]">{asset.id}</dd>
            </div>
            <div>
              <dt>
                <SectionLabel>등록일</SectionLabel>
              </dt>
              <dd className="mt-1 font-mono text-[13px]">{asset.createdAt}</dd>
            </div>
            {asset.type === "repo" ? (
              <div className="sm:col-span-2">
                <dt>
                  <SectionLabel>레포 URL</SectionLabel>
                </dt>
                <dd className="mt-1 font-mono text-[13px]">{asset.repoUrl}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>
                    <SectionLabel>호스트 IP</SectionLabel>
                  </dt>
                  <dd className="mt-1 font-mono text-[13px]">{asset.hostIp}</dd>
                </div>
                <div>
                  <dt>
                    <SectionLabel>호스트명</SectionLabel>
                  </dt>
                  <dd className="mt-1 font-mono text-[13px]">{asset.hostname}</dd>
                </div>
                <div>
                  <dt>
                    <SectionLabel>SSH 포트</SectionLabel>
                  </dt>
                  <dd className="mt-1 font-mono text-[13px]">{asset.sshPort}</dd>
                </div>
                <div>
                  <dt>
                    <SectionLabel>인증 방식</SectionLabel>
                  </dt>
                  <dd className="mt-1 text-sm">{asset.authType === "key" ? "SSH 키" : "비밀번호"}</dd>
                </div>
                <div>
                  <dt>
                    <SectionLabel>사용자명</SectionLabel>
                  </dt>
                  <dd className="mt-1 font-mono text-[13px]">{asset.username}</dd>
                </div>
              </>
            )}
            <div>
              <dt>
                <SectionLabel>OS</SectionLabel>
              </dt>
              <dd className="mt-1 text-[13px]">{asset.os || "—"}</dd>
            </div>
            <div>
              <dt>
                <SectionLabel>담당자</SectionLabel>
              </dt>
              <dd className="mt-1 text-[13px]">{asset.owner || "—"}</dd>
            </div>
            {asset.type === "server" && (
              <>
                <div>
                  <dt>
                    <SectionLabel>종류</SectionLabel>
                  </dt>
                  <dd className="mt-1 text-[13px]">{asset.category || "—"}</dd>
                </div>
                <div>
                  <dt>
                    <SectionLabel>제조사</SectionLabel>
                  </dt>
                  <dd className="mt-1 text-[13px]">{asset.vendor || "—"}</dd>
                </div>
              </>
            )}
          </dl>
        </Card>

        <div className="mb-6">
          <ScheduleForm assetId={id} initialSchedule={schedule} />
        </div>
        {asset.type === "server" && (
          <div className="mb-6">
            <CveList matches={listCveMatches(id)} />
          </div>
        )}

        <Card title="점검 이력" bodyClassName="p-0">
          {runs.length === 0 ? (
            <p className="p-5 text-[13px] italic text-muted">
              아직 점검 이력이 없습니다 — 우측 상단의 점검 시작 버튼으로 첫 점검을 실행하세요.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((run) => {
                const summary = getRunRiskSummary(run.id);
                const outcome = overallRunOutcome(summary);
                return (
                  <li key={run.id}>
                    <Link
                      href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                      className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-bg"
                    >
                      <span className="font-mono text-[13px] text-muted">
                        {formatKst(run.createdAt)}
                      </span>
                      <span className="text-[13px] text-muted">
                        {run.triggerType === "scheduled" ? "예약" : "수동"}
                      </span>
                      {run.status === "running" ? (
                        <StatusBadge status="progress">진행 중</StatusBadge>
                      ) : run.status === "cancelled" ? (
                        <StatusBadge status="neutral">취소됨</StatusBadge>
                      ) : run.status === "failed" ? (
                        <StatusBadge status="fail">실패</StatusBadge>
                      ) : (
                        <StatusBadge status={outcome}>{OUTCOME_LABEL[outcome]}</StatusBadge>
                      )}
                      <span className="ml-auto font-mono text-[13px] text-muted">
                        C {summary.severityCounts.Critical} · H {summary.severityCounts.High}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
