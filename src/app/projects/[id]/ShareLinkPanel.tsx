"use client";

import { useState } from "react";

export function ShareLinkPanel({ projectId, shareToken }: { projectId: string; shareToken: string }) {
  const [token, setToken] = useState(shareToken);
  const [newPassword, setNewPassword] = useState("");

  async function handleRegenerate() {
    const res = await fetch(`/api/projects/${projectId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setToken((await res.json()).shareToken);
      setNewPassword("");
    }
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";

  return (
    <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-4 text-sm">
      <p className="mb-2 font-bold">PM 공유 링크</p>
      <p className="mb-3 font-mono text-xs text-[var(--color-muted)]">{shareUrl}</p>
      <div className="flex gap-2">
        <input type="password" placeholder="새 비밀번호" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1" />
        <button onClick={handleRegenerate} className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-3 py-1.5">링크/비밀번호 재발급</button>
      </div>
    </div>
  );
}
