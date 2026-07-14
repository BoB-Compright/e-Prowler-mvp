"use client";

import { useState } from "react";
import { formatKst } from "@/lib/time/kst";
import type { DecoratedCheckResult } from "@/lib/checks/types";
import { Card } from "../../_components/Card";
import { SectionLabel } from "../../_components/SectionLabel";
import { StatusBadge } from "../../_components/StatusBadge";
import type { BadgeStatus } from "../../_components/statusBadgeStyles";
import { SecurityScoreGauge } from "@/app/_components/dashboard/SecurityScoreGauge";
import type { ScoreGrade } from "@/lib/dashboard/securityScore";
import { ShareReport } from "./ShareReport";

type AssetVerdict = "pass" | "fail" | "review" | "error" | "running" | "cancelled" | "none";

interface ShareAsset {
  id: string;
  displayName: string;
  type: "repo" | "server";
  verdict: AssetVerdict;
}

interface SharePerAsset {
  assetId: string;
  run: { id: string; createdAt: string; repoUrl: string } | null;
  checks: DecoratedCheckResult[];
}

interface ShareData {
  project: { name: string; pmName: string };
  assets: ShareAsset[];
  perAsset: SharePerAsset[];
  score?: { score: number; grade: ScoreGrade };
}

// 자산별 판정 배지 매핑 (#72) — 내부 자산 관리 화면(src/app/assets/page.tsx의
// STATUS_BADGE)과 동일한 규칙을 사용한다: 실패(error, 파이프라인 자체 실패)는
// 취약(fail, 점검은 성공했지만 취약점 발견)과 구분되는 별개의 배지다.
const VERDICT_BADGE: Record<AssetVerdict, { status: BadgeStatus; label: string }> = {
  pass: { status: "pass", label: "양호" },
  fail: { status: "fail", label: "취약" },
  review: { status: "review", label: "검토" },
  error: { status: "fail", label: "실패" },
  running: { status: "progress", label: "진행 중" },
  cancelled: { status: "neutral", label: "취소됨" },
  none: { status: "neutral", label: "미점검" },
};

type ShareLinkStatus = { ok: true } | { ok: false; reason: "not_found" | "disabled" | "revoked" };

const REJECTION_MESSAGES: Record<"not_found" | "disabled" | "revoked", string> = {
  not_found: "유효하지 않은 공유 링크입니다.",
  disabled: "이 공유 링크는 현재 비활성화되어 있습니다. 담당자에게 문의하세요.",
  revoked: "이 공유 링크는 폐기되어 더 이상 사용할 수 없습니다.",
};

export function ShareGate({ token, initialStatus }: { token: string; initialStatus: ShareLinkStatus }) {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<ShareData | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "locked") {
          setError("5회 실패로 잠겼습니다. 15분 후 다시 시도하세요");
        } else if (body.error === "disabled" || body.error === "revoked" || body.error === "not_found") {
          setError(REJECTION_MESSAGES[body.error as "not_found" | "disabled" | "revoked"]);
        } else {
          setError("비밀번호가 올바르지 않습니다");
        }
        return;
      }
      const json: ShareData = await res.json();
      setData(json);
      setSelectedAssetId(json.assets[0]?.id ?? null);
    } finally {
      setSubmitting(false);
    }
  }

  if (data) {
    const perAssetByAssetId = new Map(data.perAsset.map((entry) => [entry.assetId, entry]));
    const selectedAsset = data.assets.find((asset) => asset.id === selectedAssetId) ?? null;
    const selectedEntry = selectedAssetId ? (perAssetByAssetId.get(selectedAssetId) ?? null) : null;

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.02em]">{data.project.name}</h1>
          <p className="mt-1 text-[13px] text-muted">담당 PM: {data.project.pmName}</p>
        </div>

        {data.score && (
          <Card className="mb-5" bodyClassName="p-5">
            <SectionLabel>종합 보안 점수</SectionLabel>
            <div className="mt-2 flex justify-center">
              <SecurityScoreGauge score={data.score.score} grade={data.score.grade} />
            </div>
          </Card>
        )}

        {data.assets.length === 0 ? (
          <Card bodyClassName="p-5">
            <p className="text-[13px] italic text-muted">등록된 자산이 없습니다.</p>
          </Card>
        ) : (
          <>
            <div className="mb-4 -mx-1 overflow-x-auto px-1">
              <div className="flex gap-2 pb-1">
                {data.assets.map((asset) => {
                  const verdictBadge = VERDICT_BADGE[asset.verdict];
                  const active = asset.id === selectedAssetId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                        active ? "border-primary bg-surface font-semibold" : "border-border hover:bg-bg"
                      }`}
                    >
                      <span>{asset.displayName}</span>
                      <StatusBadge status={verdictBadge.status}>{verdictBadge.label}</StatusBadge>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedEntry?.run ? (
              <ShareReport
                assetName={selectedAsset?.displayName ?? ""}
                targetLabel={selectedEntry.run.repoUrl}
                scannedAt={formatKst(selectedEntry.run.createdAt)}
                checks={selectedEntry.checks}
              />
            ) : (
              <Card bodyClassName="p-5">
                <p className="text-[13px] italic text-muted">점검 이력이 없습니다.</p>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  // Invalid/disabled/revoked tokens never see the password form — the
  // rejection is unambiguous and there is nothing left to try here.
  if (!initialStatus.ok) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-sm" bodyClassName="p-6">
          <h1 className="mb-1 text-[20px] font-bold tracking-[-0.02em]">접근할 수 없는 링크입니다</h1>
          <p className="text-[13px] text-muted">{REJECTION_MESSAGES[initialStatus.reason]}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-sm" bodyClassName="p-6">
        <h1 className="mb-1 text-[20px] font-bold tracking-[-0.02em]">공유된 점검 결과</h1>
        <p className="mb-4 text-[13px] text-muted">
          이 프로젝트의 점검 결과를 보려면 비밀번호를 입력하세요.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="share-password" className="mb-1 block text-[13px] font-medium">
              비밀번호
            </label>
            <input
              id="share-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-[13px] text-fail">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "확인 중..." : "확인"}
          </button>
        </form>
      </Card>
    </div>
  );
}
