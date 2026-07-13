"use client";

import { useState } from "react";

// 헤더(모바일)·사이드바(데스크톱)가 공유하는 로그아웃 버튼. variant로 텍스트/아이콘 형태 선택.
export function LogoutButton({ variant = "text" }: { variant?: "text" | "icon" }) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // 전체 리로드로 루트 레이아웃의 서버 세션 체크가 재실행되어 쿠키 삭제가 즉시 반영됨.
      window.location.href = "/login";
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label="로그아웃"
        title="로그아웃"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-bg hover:text-text disabled:opacity-60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:bg-bg disabled:opacity-60"
    >
      {loggingOut ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
