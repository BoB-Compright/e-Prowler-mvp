"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectSearch } from "./ProjectSearch";
import { ProjectForm } from "./ProjectForm";
import { Modal } from "../_components/Modal";

// 프로젝트 탭 상단 툴바: 좌측 검색 + 우측 새 프로젝트 버튼(모달 생성).
export function ProjectsToolbar() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <ProjectSearch />
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
      >
        + 새 프로젝트
      </button>
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="새 프로젝트">
        <ProjectForm
          onSuccess={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
