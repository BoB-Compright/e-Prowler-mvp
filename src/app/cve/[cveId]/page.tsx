import Link from "next/link";
import { listCveMatchesByCve } from "@/lib/cve/store";
import { buildUpgradeGuide } from "@/lib/cve/mitigationGuide";
import { getCachedTranslations } from "@/lib/cve/translate";
import { formatKst } from "@/lib/time/kst";
import type { CveSeverity } from "@/lib/cve/nvdClient";
import { Card } from "../../_components/Card";
import { SectionLabel } from "../../_components/SectionLabel";
import { StatusBadge } from "../../_components/StatusBadge";
import type { BadgeStatus } from "../../_components/statusBadgeStyles";
import { RescanButton } from "../../runs/[id]/report/RescanButton";
import { CveMatchDismissButton } from "./CveMatchDismissButton";

export const dynamic = "force-dynamic";

const SEVERITY_LABEL: Record<CveSeverity, string> = {
  critical: "심각", high: "높음", medium: "중간", low: "낮음", unknown: "미상",
};
const SEVERITY_STATUS: Record<CveSeverity, BadgeStatus> = {
  critical: "fail", high: "fail", medium: "review", low: "neutral", unknown: "neutral",
};

export default async function CveDetailPage({ params }: { params: Promise<{ cveId: string }> }) {
  const { cveId } = await params;
  const matches = listCveMatchesByCve(cveId);
  const nvdUrl = `https://nvd.nist.gov/vuln/detail/${cveId}`;

  if (matches.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[960px] px-4 py-6 md:px-8 md:py-8">
        <h1 className="font-mono text-[22px] font-bold">{cveId}</h1>
        <p className="mt-3 text-[13px] text-muted">이 CVE에 영향받는 자산이 없습니다.</p>
        <Link href="/cve" className="mt-4 inline-block text-[13px] text-primary hover:underline">← CVE 피드로</Link>
      </main>
    );
  }

  const head = matches[0];
  const ko = getCachedTranslations([cveId]).get(cveId) ?? head.summary;
  const guide = buildUpgradeGuide(matches.map((m) => m.packageName));

  return (
    <main className="mx-auto w-full max-w-[960px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/cve" className="text-[13px] text-primary hover:underline">← CVE 피드</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <h1 className="font-mono text-[24px] font-extrabold tracking-tight">{cveId}</h1>
        <StatusBadge status={SEVERITY_STATUS[head.severity]}>{SEVERITY_LABEL[head.severity]}</StatusBadge>
        {head.cvssScore != null && <span className="font-mono text-[13px] font-bold">CVSS {head.cvssScore.toFixed(1)}</span>}
        <a href={nvdUrl} target="_blank" rel="noreferrer" className="text-[12px] text-primary hover:underline">NVD 원문 ↗</a>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{ko}</p>
      <p className="mt-1 font-mono text-[11px] text-muted">
        {head.publishedAt ? `등록 ${head.publishedAt.slice(0, 10)}` : "등록일 미상"} · 최초 발견 {formatKst(head.firstSeenAt)}
      </p>

      <div className="mt-6">
        <Card title={`영향받는 자산 (${matches.length})`} bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {matches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <Link href={`/assets/${m.assetId}`} className="font-semibold text-primary hover:underline">
                  {m.assetName}
                </Link>
                <span className="rounded bg-bg px-2 py-0.5 text-[11px] text-muted">
                  {m.assetType === "repo" ? "레포" : "서버"}
                </span>
                <span className="font-mono text-[13px] text-muted">{m.packageName} {m.packageVersion}</span>
                {m.aiImpact && <p className="w-full text-[13px] text-muted">영향: {m.aiImpact}</p>}
                <span className="ml-auto flex items-center gap-2">
                  {m.assetType === "server" && <RescanButton assetId={m.assetId} />}
                  <CveMatchDismissButton matchId={m.id} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="조치 가이드">
          <p className="text-[13px] leading-relaxed">
            영향받는 패키지를 배포판 보안 패치가 적용된 버전으로 업그레이드한 뒤, 위 자산에서 재점검으로 조치를 확인하세요.
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <SectionLabel>Debian/Ubuntu (apt)</SectionLabel>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap">{guide.apt}</pre>
            </div>
            <div>
              <SectionLabel>RHEL/CentOS (yum)</SectionLabel>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap">{guide.yum}</pre>
            </div>
          </div>
          {matches.find((m) => m.aiRemediation) && (
            <div className="mt-4">
              <SectionLabel>AI 조치 제안</SectionLabel>
              <p className="mt-1 text-[13px] leading-relaxed">{matches.find((m) => m.aiRemediation)!.aiRemediation}</p>
            </div>
          )}
          <a href={nvdUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[12px] text-primary hover:underline">
            NVD에서 상세·참조 보기 ↗
          </a>
        </Card>
      </div>
    </main>
  );
}
