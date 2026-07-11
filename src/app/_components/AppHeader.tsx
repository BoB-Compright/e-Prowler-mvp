"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { HelpButton } from "./onboarding/HelpButton";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_ITEMS, isActiveNav } from "./navItems";

interface HeaderUser {
  username: string;
}

export function AppHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActiveNav(pathname, item));
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Full reload so the root layout re-runs its server-side session check
      // and the cleared cookie takes effect immediately.
      window.location.href = "/login";
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <div className="min-w-0 md:hidden">
          <div className="truncate text-[15px] font-bold tracking-tight text-primary">NH-Guardian</div>
        </div>
        <div className="hidden text-[13px] text-muted md:block">
          {current ? current.label : "NH-Guardian"}
        </div>
        <div className="flex-1" />
        {user && (
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-white">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-[13px] font-medium md:inline">{user.username}</span>
            <HelpButton />
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:bg-bg disabled:opacity-60"
            >
              {loggingOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </div>
        )}
        <ThemeToggle />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] whitespace-nowrap ${
              isActiveNav(pathname, item)
                ? "bg-primary font-semibold text-white"
                : "text-muted hover:bg-bg"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
