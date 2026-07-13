"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActiveNav } from "./navItems";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { HelpButton } from "./onboarding/HelpButton";
import { LogoutButton } from "./LogoutButton";

// 온보딩 투어 앵커: 내비 href → data-tour 값. 투어 스텝(steps.ts)의 anchor와 일치해야 한다.
const NAV_TOUR_ANCHORS: Record<string, string | undefined> = {
  "/": "nav-dashboard",
  "/projects": "nav-projects",
  "/runs": "nav-runs",
  "/cve": "nav-cve",
};

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-surface px-3 py-6 md:flex">
      <div className="mb-8 px-3">
        <BrandLogo subtext />
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-tour={NAV_TOUR_ANCHORS[item.href]}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ${
              isActiveNav(pathname, item)
                ? "bg-primary font-semibold text-white"
                : "text-muted hover:bg-bg hover:text-text"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      {/* 하단 유틸 클러스터: 설정·도움말·다크모드·로그아웃 (데스크톱 전용 — 사이드바 자체가 md:flex). */}
      <div className="mt-2 flex items-center gap-2 border-t border-border px-1 pt-4">
        <Link
          href="/settings"
          data-tour="nav-settings"
          aria-label="설정"
          title="설정"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border ${
            pathname === "/settings" ? "bg-primary text-white" : "text-muted hover:bg-bg hover:text-text"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
        <HelpButton variant="icon" />
        <ThemeToggle />
        <LogoutButton variant="icon" />
      </div>
    </aside>
  );
}
