"use client";

import { ONBOARDING_FORCE_KEY } from "@/lib/onboarding/steps";

// 온보딩 투어를 수동 재실행한다. 투어는 대시보드(/)에 마운트돼 있으므로,
// force 플래그를 세팅한 뒤 /로 전체 이동해(대시보드가 아니면 이동, 맞으면
// 재마운트) 자산 수·열람 여부와 무관하게 투어를 시작시킨다.
export function HelpButton() {
  function start() {
    sessionStorage.setItem(ONBOARDING_FORCE_KEY, "1");
    window.location.assign("/");
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
