"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { NAV_ITEMS, isActiveNav } from "./navItems";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { HelpButton } from "./onboarding/HelpButton";
import { LogoutButton } from "./LogoutButton";

const NAV_COLLAPSE_EVENT = "nhg-nav-collapse";
// 온보딩 투어 앵커: 내비 href → data-tour 값. 투어 스텝(steps.ts)의 anchor와 일치해야 한다.
const NAV_TOUR_ANCHORS: Record<string, string | undefined> = {
  "/": "nav-dashboard",
  "/projects": "nav-projects",
  "/runs": "nav-runs",
  "/cve": "nav-cve",
};

function subscribe(cb: () => void) {
  window.addEventListener(NAV_COLLAPSE_EVENT, cb);
  return () => window.removeEventListener(NAV_COLLAPSE_EVENT, cb);
}
function getSnapshot(): boolean {
  return document.documentElement.dataset.navCollapsed === "1";
}
function getServerSnapshot(): boolean {
  return false; // SSR·초기 스냅샷은 펼침
}

export function AppSidebar() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !collapsed;
    if (next) document.documentElement.dataset.navCollapsed = "1";
    else delete document.documentElement.dataset.navCollapsed;
    try {
      if (next) localStorage.setItem("nhg_nav_collapsed", "1");
      else localStorage.removeItem("nhg_nav_collapsed");
    } catch {
      /* localStorage 불가 환경 무시 */
    }
    window.dispatchEvent(new Event(NAV_COLLAPSE_EVENT));
  }

  return (
    <aside
      data-app-sidebar
      className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col overflow-hidden border-r border-border bg-surface px-3 py-6 md:flex"
    >
      <div className="mb-8 flex items-center justify-between gap-2 px-1">
        {!collapsed && (
          <div className="min-w-0 px-2">
            <BrandLogo subtext />
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          title={collapsed ? "펼치기" : "접기"}
          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border text-muted hover:bg-bg hover:text-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          </svg>
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-tour={NAV_TOUR_ANCHORS[item.href]}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ${
              isActiveNav(pathname, item)
                ? "bg-primary font-semibold text-white"
                : "text-muted hover:bg-bg hover:text-text"
            } ${collapsed ? "justify-center" : ""}`}
          >
            {item.icon}
            {!collapsed && item.label}
          </Link>
        ))}
      </nav>
      <div className={`mt-2 flex items-center gap-2 border-t border-border px-1 pt-4 ${collapsed ? "justify-center" : ""}`}>
        {/* 접힘: 로그아웃 아이콘만. 펼침: 설정·도움말·다크·로그아웃. */}
        {!collapsed && (
          <>
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
          </>
        )}
        <LogoutButton variant="icon" />
      </div>
    </aside>
  );
}
