"use client";

import { useEffect, useState } from "react";
import { Card } from "../../_components/Card";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";
const secondaryButtonClass =
  "rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5 whitespace-nowrap";

export function ShareLinkPanel({ projectId, shareToken }: { projectId: string; shareToken: string }) {
  const [token, setToken] = useState(shareToken);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Reads `window.location`, which is unavailable during SSR — this must run
    // post-mount so the server render and first client render both show "" and
    // hydrate cleanly, with the real URL populated right after.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShareUrl(`${window.location.origin}/share/${token}`);
  }, [token]);

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
    setToken((await res.json()).shareToken);
    setNewPassword("");
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

  return (
    <Card title="공유 설정">
      <div className="flex flex-col gap-4">
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
          </div>
        </div>
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
        </div>
        {error && <p className="text-[13px] text-fail">{error}</p>}
      </div>
    </Card>
  );
}
