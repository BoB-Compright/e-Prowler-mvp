"use client";

import { useEffect, useState } from "react";
import { Card } from "../../_components/Card";
import { StatusBadge } from "../../_components/StatusBadge";
import type { BadgeStatus } from "../../_components/statusBadgeStyles";
import type { ShareStatus } from "@/lib/projects/types";
import { buildShareMailto } from "@/lib/projects/shareMail";
import { buildShareUrl } from "@/lib/projects/shareUrl";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";
const secondaryButtonClass =
  "rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50";
const dangerButtonClass = "rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90";

const STATUS_BADGE: Record<ShareStatus, { status: BadgeStatus; label: string }> = {
  active: { status: "pass", label: "활성" },
  disabled: { status: "neutral", label: "비활성" },
  revoked: { status: "fail", label: "폐기됨" },
};

export function ShareLinkPanel({
  projectId,
  shareToken,
  shareStatus,
  projectName,
  pmName,
  pmEmail,
  shareBaseUrl,
}: {
  projectId: string;
  shareToken: string;
  shareStatus: ShareStatus;
  projectName: string;
  pmName: string;
  pmEmail: string;
  shareBaseUrl: string | null;
}) {
  const [token, setToken] = useState(shareToken);
  const [status, setStatus] = useState<ShareStatus>(shareStatus);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    // Reads `window.location`, which is unavailable during SSR — this must run
    // post-mount so the server render and first client render both show "" and
    // hydrate cleanly, with the real URL populated right after.
    // SHARE_BASE_URL(고정 공개 주소)이 설정돼 있으면 담당자의 접속 주소와 무관하게
    // 그 주소로 링크를 만든다 — localhost로 접속 중이어도 메일·QR에 담기는 주소가
    // PM이 열 수 있는 주소가 되도록.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShareUrl(buildShareUrl(shareBaseUrl ?? window.location.origin, token));
    // 토큰이 바뀌면(재발급 등) 이전 토큰으로 만든 QR은 죽은 링크이므로 폐기 — 아래 생성 이펙트가 재생성.
    setQrDataUrl(null);
    setQrError(null);
  }, [token, shareBaseUrl]);

  useEffect(() => {
    // QR은 패널이 열려 있고 아직 만들지 않았을 때만 생성. 재발급으로 qrDataUrl이 비워지면 새 URL로 재생성된다.
    if (!qrOpen || !shareUrl || qrDataUrl || qrError) return;
    let cancelled = false;
    (async () => {
      try {
        // 최초 필요 시에만 qrcode 로드(초기 번들 제외). data URL이라 외부 호출 없음(CSP 안전).
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(shareUrl, { width: 320, margin: 2 });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrError("QR 생성에 실패했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrOpen, shareUrl, qrDataUrl, qrError]);

  async function handleRegenerate() {
    setError(null);
    if (!newPassword) {
      setError("비밀번호를 입력해주세요");
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "재발급에 실패했습니다");
      return;
    }
    const data = await res.json();
    setToken(data.shareToken);
    setStatus(data.shareStatus);
    setNewPassword("");
  }

  async function handleToggle(enabled: boolean) {
    setError(null);
    setTogglePending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setEnabled", enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "변경에 실패했습니다");
        return;
      }
      setStatus(data.shareStatus);
    } finally {
      setTogglePending(false);
    }
  }

  async function handleRevoke() {
    setError(null);
    setRevokePending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "폐기에 실패했습니다");
        return;
      }
      setStatus(data.shareStatus);
      setConfirmingRevoke(false);
    } finally {
      setRevokePending(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("클립보드 복사에 실패했습니다");
    }
  }

  function toggleQr() {
    setQrOpen((open) => !open);
  }

  const isRevoked = status === "revoked";
  const badge = STATUS_BADGE[status];

  return (
    <Card title="공유 설정">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className={labelClass}>공유 링크 상태</p>
          <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={status === "active"}
              disabled={isRevoked || togglePending}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            공유 링크 활성화
          </label>
        </div>
        <div>
          <p className={labelClass}>PM 공유 링크</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className={`min-w-0 flex-1 font-mono text-[13px] ${inputClass}`}
            />
            <button type="button" onClick={handleCopy} className={secondaryButtonClass}>
              {copied ? "복사됨" : "복사"}
            </button>
            {status === "active" && shareUrl && pmEmail.trim() && (
              <a
                href={buildShareMailto({ pmEmail, pmName, projectName, shareUrl })}
                className={secondaryButtonClass}
              >
                PM에게 메일로 보내기
              </a>
            )}
          </div>
          {status === "active" && (
            <p className="mt-1 text-[13px] text-muted">
              메일 본문에는 링크만 담기며, 열람 비밀번호는 보안을 위해 별도 채널로 전달하세요.
            </p>
          )}
          {status !== "active" && (
            <p className="mt-1 text-[13px] text-muted">
              {isRevoked
                ? "폐기된 링크입니다. 이 주소로는 더 이상 접근할 수 없습니다."
                : "비활성화된 링크입니다. 다시 켜기 전까지는 접근할 수 없습니다."}
            </p>
          )}
        </div>
        {status === "active" && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className={labelClass}>QR 코드</p>
              <button
                type="button"
                onClick={toggleQr}
                className={secondaryButtonClass}
                aria-expanded={qrOpen}
              >
                {qrOpen ? "QR 접기" : "QR 코드 표시"}
              </button>
            </div>
            {qrOpen && (
              <div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-border bg-bg p-4">
                {qrError ? (
                  <p className="text-[13px] text-fail">{qrError}</p>
                ) : qrDataUrl ? (
                  <>
                    {/* data URL 이미지 — 스캔하면 공유 리포트 링크로 이동한다. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="공유 링크 QR 코드" width={256} height={256} className="h-64 w-64" />
                    <p className="font-mono text-[12px] break-all text-center text-muted">{shareUrl}</p>
                    <p className="max-w-[360px] text-center text-[12px] text-muted">
                      스캔하면 공유 리포트 링크로 이동합니다. 열람에는 비밀번호가 필요합니다.
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted">QR 생성 중…</p>
                )}
              </div>
            )}
          </div>
        )}
        <div>
          <p className={labelClass}>링크 비밀번호 재발급</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              type="password"
              placeholder="새 비밀번호"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`min-w-0 flex-1 ${inputClass}`}
            />
            <button type="button" onClick={handleRegenerate} className={secondaryButtonClass}>
              링크/비밀번호 재발급
            </button>
          </div>
          {isRevoked && (
            <p className="mt-1 text-[13px] text-muted">
              재발급하면 새 링크가 발급되고 즉시 활성 상태가 됩니다.
            </p>
          )}
        </div>
        <div>
          <p className={labelClass}>공유 링크 폐기</p>
          <p className="mt-1 text-[13px] text-muted">
            폐기하면 이 링크는 영구적으로 무효화됩니다. 되돌릴 수 없으며, 다시 공유하려면 재발급해야 합니다.
          </p>
          {isRevoked ? (
            <p className="mt-2 text-[13px] font-medium text-fail">이미 폐기된 링크입니다.</p>
          ) : confirmingRevoke ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium">정말 폐기하시겠습니까? 이 작업은 되돌릴 수 없습니다.</span>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revokePending}
                className={`${dangerButtonClass} disabled:opacity-60`}
              >
                {revokePending ? "폐기 중..." : "폐기 확정"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRevoke(false)}
                disabled={revokePending}
                className={secondaryButtonClass}
              >
                취소
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingRevoke(true)} className={`mt-2 ${dangerButtonClass}`}>
              공유 링크 폐기
            </button>
          )}
        </div>
        {error && <p className="text-[13px] text-fail">{error}</p>}
      </div>
    </Card>
  );
}
