"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// StartScanButton(자산 상세)과 동일한 API(POST /api/runs)를 호출해 새 run을 만든다.
// 완료된 리포트 화면에서 재점검을 바로 트리거할 수 있게 하는 것이 목적이므로,
// 이미 진행 중인 run이 있으면(409) 그 안내 문구를 그대로 보여준다 (#75).
export function RescanButton({ assetId }: { assetId: string }) {
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
        setError(data.error ?? "재점검을 시작하지 못했습니다");
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
        className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-primary hover:bg-primary/5 disabled:opacity-50"
      >
        {submitting ? "시작 중…" : "재스캔"}
      </button>
      {error && <p className="max-w-52 text-right text-[13px] text-fail">{error}</p>}
    </div>
  );
}
