"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartRunForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "점검을 시작하지 못했습니다");
        return;
      }
      router.push(`/runs/${data.run.id}`);
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1.5 flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        required
        spellCheck={false}
        placeholder="https://github.com/owner/repo.git"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        className="flex-1 rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 font-mono text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "시작 중…" : "점검 시작"}
      </button>
      {error && (
        <p className="text-sm text-[var(--color-fail)] sm:ml-2 sm:self-center">{error}</p>
      )}
    </form>
  );
}
