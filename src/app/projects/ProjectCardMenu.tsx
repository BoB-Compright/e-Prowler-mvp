"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";

// 프로젝트 카드의 삭제 진입점: ⋯ 버튼 → 확인 다이얼로그 → DELETE.
export function ProjectCardMenu({
  projectId,
  projectName,
  assetCount,
}: {
  projectId: string;
  projectName: string;
  assetCount: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("삭제에 실패했습니다");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("서버 연결 실패");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={`${projectName} 삭제`}
        className="rounded-md px-2 py-1 text-[13px] text-muted hover:bg-bg hover:text-fail"
      >
        삭제
      </button>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="프로젝트 삭제">
        <p className="text-[13px] text-muted">
          &lsquo;<span className="font-semibold text-text">{projectName}</span>&rsquo; 프로젝트를 삭제할까요?
          소속 자산 {assetCount}개는 삭제되지 않고 연결만 해제됩니다.
        </p>
        {error && <p className="mt-2 text-[13px] text-fail">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted hover:bg-bg"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </Modal>
    </>
  );
}
