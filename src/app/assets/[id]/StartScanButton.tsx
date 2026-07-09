"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartScanButton({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
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
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={start}
        disabled={submitting}
        className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-white hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "시작 중…" : "점검 시작"}
      </button>
      {error && <p className="max-w-52 text-right text-[13px] text-fail">{error}</p>}
    </div>
  );
}
