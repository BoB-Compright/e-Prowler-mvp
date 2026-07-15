"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

const CATEGORY_LABEL: Record<string, string> = {
  container: "컨테이너", OS: "OS", WEB: "WEB", WAS: "WAS", DB: "DB",
};

// 단일 자산 점검 시 카테고리 사전선택 모달. 기본 전체 체크, 최소 1개, POST /api/runs → /runs/{id} 이동.
export function ScanCategoryModal({
  open, onClose, assetId, scanCategories,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  scanCategories: string[];
}) {
  const router = useRouter();
  const [cats, setCats] = useState<string[]>(scanCategories);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달을 열 때마다 전체 체크로 초기화(렌더 중 상태 조정, effect 미사용).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCats(scanCategories);
      setError(null);
    }
  }

  async function start() {
    if (cats.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, categories: cats }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.run?.id) {
        onClose();
        router.push(`/runs/${data.run.id}`);
      } else {
        setError(String(data.error ?? "점검 시작에 실패했습니다"));
      }
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="점검 카테고리 선택">
      <p className="text-[13px] text-muted">점검할 카테고리를 고르면 대상 항목과 소요시간이 줄어듭니다.</p>
      <div className="mt-3 flex flex-col gap-2">
        {scanCategories.map((cat) => (
          <label key={cat} className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={cats.includes(cat)}
              onChange={(e) =>
                setCats((prev) => (e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat)))
              }
            />
            {CATEGORY_LABEL[cat] ?? cat}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-[13px] text-fail">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted hover:bg-bg"
        >
          취소
        </button>
        <button
          type="button"
          onClick={start}
          disabled={submitting || cats.length === 0}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "시작 중…" : "점검 시작"}
        </button>
      </div>
    </Modal>
  );
}
