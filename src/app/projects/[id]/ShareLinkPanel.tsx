"use client";

import { useEffect, useState } from "react";

export function ShareLinkPanel({ projectId, shareToken }: { projectId: string; shareToken: string }) {
  const [token, setToken] = useState(shareToken);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");

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

  return (
    <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-4 text-sm">
      <p className="mb-2 font-bold">PM 공유 링크</p>
      <p className="mb-3 font-mono text-xs text-[var(--color-muted)]">{shareUrl}</p>
      <div className="flex gap-2">
        <input type="password" placeholder="새 비밀번호" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1" />
        <button onClick={handleRegenerate} className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-3 py-1.5">링크/비밀번호 재발급</button>
      </div>
      {error && <p className="text-[var(--color-fail)]">{error}</p>}
    </div>
  );
}
