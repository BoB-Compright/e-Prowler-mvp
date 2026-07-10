"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FleetScanButton({ projectId, assetCount }: { projectId: string; assetCount: number }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scan`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "일괄 점검을 시작하지 못했습니다");
        return;
      }
      router.push(`/runs/batch/${data.batchId}`);
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting || assetCount === 0}
        className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "실행 중…" : `일괄 점검 실행 (${assetCount}개)`}
      </button>
      {assetCount === 0 && (
        <p className="mt-1.5 text-[13px] text-muted">일괄 점검을 실행하려면 자산이 필요합니다.</p>
      )}
      {error && <p className="mt-1.5 text-[13px] text-fail">{error}</p>}
    </div>
  );
}
