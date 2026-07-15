"use client";

import { useState } from "react";
import { ScanCategoryModal } from "./ScanCategoryModal";

// 단일 자산 점검 진입 버튼 + 카테고리 모달. 자산 상세/리포트 재점검에서 사용.
export function ScanCategoryButton({
  assetId, scanCategories, label, variant = "primary",
}: {
  assetId: string;
  scanCategories: string[];
  label: string;
  variant?: "primary" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const cls =
    variant === "outline"
      ? "rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-primary hover:bg-primary/5"
      : "rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-white hover:opacity-90";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cls}>
        {label}
      </button>
      <ScanCategoryModal open={open} onClose={() => setOpen(false)} assetId={assetId} scanCategories={scanCategories} />
    </>
  );
}
