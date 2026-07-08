"use client";

import { useState } from "react";

interface ShareData {
  project: { name: string; pmName: string };
  assets: { id: string; displayName: string; type: "repo" | "server" }[];
  runs: { id: string; status: string; createdAt: string; assetId: string | null }[];
}

export function ShareGate({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/share/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "locked" ? "5회 실패로 잠겼습니다. 15분 후 다시 시도하세요" : "비밀번호가 올바르지 않습니다");
      return;
    }
    setData(await res.json());
  }

  if (data) {
    return (
      <div className="text-sm">
        <h1 className="mb-2 text-lg font-bold text-[var(--color-text)]">{data.project.name}</h1>
        <p className="mb-6 text-[var(--color-muted)]">담당 PM: {data.project.pmName}</p>
        <h2 className="mb-2 font-bold">자산 ({data.assets.length})</h2>
        <ul className="mb-6">{data.assets.map((asset) => <li key={asset.id}>{asset.displayName}</li>)}</ul>
        <h2 className="mb-2 font-bold">점검 이력 ({data.runs.length})</h2>
        <ul>{data.runs.map((run) => <li key={run.id}>{run.createdAt} — {run.status}</li>)}</ul>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
      <p className="text-[var(--color-muted)]">이 프로젝트의 점검 결과를 보려면 비밀번호를 입력하세요.</p>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
        className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1" />
      {error && <p className="text-[var(--color-fail)]">{error}</p>}
      <button type="submit" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white">확인</button>
    </form>
  );
}
