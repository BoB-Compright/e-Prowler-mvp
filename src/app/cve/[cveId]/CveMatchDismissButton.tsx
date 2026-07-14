"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 이 자산의 CVE 매칭을 무시 처리한다(기존 PATCH /api/cve-matches/{id} 재사용).
export function CveMatchDismissButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cve-matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: true }),
      });
      if (!res.ok) {
        setError("무시 처리 실패");
        return;
      }
      router.refresh();
    } catch {
      setError("서버 연결 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={dismiss}
        disabled={busy}
        className="rounded-lg border border-border px-3 py-1 text-[13px] hover:bg-bg disabled:opacity-50"
      >
        {busy ? "처리 중…" : "무시"}
      </button>
      {error && <span className="text-[11px] text-fail">{error}</span>}
    </span>
  );
}
