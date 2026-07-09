"use client";

import { useState } from "react";
import { Card } from "../../_components/Card";
import { SectionLabel } from "../../_components/SectionLabel";
import { StatusBadge } from "../../_components/StatusBadge";
import type { BadgeStatus } from "../../_components/statusBadgeStyles";

type AssetVerdict = "pass" | "fail" | "review" | "error" | "running" | "cancelled" | "none";

interface ShareAsset {
  id: string;
  displayName: string;
  type: "repo" | "server";
  verdict: AssetVerdict;
}

interface ShareRun {
  id: string;
  status: string;
  createdAt: string;
  assetId: string | null;
}

interface ShareData {
  project: { name: string; pmName: string };
  assets: ShareAsset[];
  runs: ShareRun[];
}

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

// 공유 뷰는 파이프라인 실행 상태(running/succeeded/failed)만 이력 표시에 사용한다 —
// 취약점 판정(양호/취약/검토)은 자산 테이블의 판정 배지(verdictBadge)로만 노출한다.
function runBadge(run: ShareRun | undefined): { status: BadgeStatus; label: string } {
  if (!run) return { status: "neutral", label: "점검 전" };
  if (run.status === "running") return { status: "progress", label: "진행 중" };
  if (run.status === "cancelled") return { status: "neutral", label: "취소됨" };
  if (run.status === "failed") return { status: "fail", label: "실패" };
  if (run.status === "succeeded") return { status: "neutral", label: "완료" };
  return { status: "neutral", label: run.status };
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
      setData(await res.json());
    } finally {
      setSubmitting(false);
    }
  }

  if (data) {
    const latestRunByAsset = new Map<string, ShareRun>();
    const runsByAsset = new Map<string, ShareRun[]>();
    for (const run of data.runs) {
      if (!run.assetId) continue;
      if (!latestRunByAsset.has(run.assetId)) {
        latestRunByAsset.set(run.assetId, run);
      }
      const list = runsByAsset.get(run.assetId);
      if (list) {
        list.push(run);
      } else {
        runsByAsset.set(run.assetId, [run]);
      }
    }

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{data.project.name}</h1>
          <p className="mt-1 text-[13px] text-muted">담당 PM: {data.project.pmName}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title={`자산 보안 상태 (${data.assets.length})`} bodyClassName="p-0">
              {data.assets.length === 0 ? (
                <p className="p-5 text-[13px] italic text-muted">등록된 자산이 없습니다.</p>
              ) : (
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
                          <SectionLabel>최근 점검</SectionLabel>
                        </th>
                        <th className="px-5 py-3">
                          <SectionLabel>판정</SectionLabel>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.assets.map((asset) => {
                        const run = latestRunByAsset.get(asset.id);
                        const verdictBadge = VERDICT_BADGE[asset.verdict];
                        return (
                          <tr key={asset.id} className="hover:bg-bg">
                            <td className="px-5 py-3 font-semibold">{asset.displayName}</td>
                            <td className="px-5 py-3 text-muted">
                              {asset.type === "repo" ? "레포" : "서버"}
                            </td>
                            <td className="px-5 py-3 font-mono text-[13px] text-muted">
                              {run ? formatTimestamp(run.createdAt) : "—"}
                            </td>
                            <td className="px-5 py-3">
                              <StatusBadge status={verdictBadge.status}>{verdictBadge.label}</StatusBadge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div>
            <Card title="상세 정보">
              <dl className="flex flex-col gap-4">
                <div>
                  <dt>
                    <SectionLabel>담당 PM</SectionLabel>
                  </dt>
                  <dd className="mt-1 text-sm">{data.project.pmName}</dd>
                </div>
                <div>
                  <dt>
                    <SectionLabel>자산 수</SectionLabel>
                  </dt>
                  <dd className="mt-1 text-sm">{data.assets.length}</dd>
                </div>
                <div>
                  <dt>
                    <SectionLabel>점검 이력</SectionLabel>
                  </dt>
                  <dd className="mt-1 text-sm">{data.runs.length}건</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>

        <div className="mt-4">
          <Card title="점검 이력" bodyClassName="p-0">
            {data.assets.length === 0 ? (
              <p className="p-5 text-[13px] italic text-muted">등록된 자산이 없습니다.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.assets.map((asset) => {
                  const assetRuns = runsByAsset.get(asset.id) ?? [];
                  return (
                    <details key={asset.id} className="px-5 py-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                        <span className="font-semibold">{asset.displayName}</span>
                        <SectionLabel>점검 이력 {assetRuns.length}건</SectionLabel>
                      </summary>
                      {assetRuns.length === 0 ? (
                        <p className="mt-2 text-[13px] italic text-muted">점검 이력이 없습니다.</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-border">
                          {assetRuns.map((run) => {
                            const badge = runBadge(run);
                            return (
                              <li key={run.id} className="flex items-center gap-3 py-2 text-sm">
                                <span className="font-mono text-[13px] text-muted">
                                  {formatTimestamp(run.createdAt)}
                                </span>
                                <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </details>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
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
