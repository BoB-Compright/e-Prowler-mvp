"use client";

import { ONBOARDING_FORCE_KEY } from "@/lib/onboarding/steps";

// 온보딩 투어를 수동 재실행한다. 투어는 대시보드(/)에 마운트돼 있으므로,
// force 플래그를 세팅한 뒤 /로 전체 이동해(대시보드가 아니면 이동, 맞으면
// 재마운트) 자산 수·열람 여부와 무관하게 투어를 시작시킨다.
export function HelpButton({ variant = "text" }: { variant?: "text" | "icon" }) {
  function start() {
    sessionStorage.setItem(ONBOARDING_FORCE_KEY, "1");
    window.location.assign("/");
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={start}
        aria-label="온보딩 도움말 다시 보기"
        title="도움말"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-bg hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.5-3 4" />
          <path d="M12 17h.01" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:bg-bg"
      aria-label="온보딩 도움말 다시 보기"
    >
      도움말
    </button>
  );
}
