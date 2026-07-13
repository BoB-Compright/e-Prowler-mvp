"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpButton } from "./onboarding/HelpButton";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "./LogoutButton";
import { BrandLogo } from "./BrandLogo";
import { NAV_ITEMS, isActiveNav } from "./navItems";

interface HeaderUser {
  username: string;
}

export function AppHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActiveNav(pathname, item));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <div className="min-w-0 md:hidden">
          <BrandLogo />
        </div>
        <div className="hidden text-[13px] text-muted md:block">
          {current ? current.label : "NH-Guardian"}
        </div>
        <div className="flex-1" />
        {user && (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-white">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-[13px] font-medium md:inline">{user.username}</span>
            {/* 데스크톱은 사이드바 하단 클러스터가 유틸을 담당 → 헤더 유틸은 모바일 전용. */}
            <div className="flex items-center gap-2 md:hidden">
              <HelpButton variant="icon" />
              <ThemeToggle />
              <LogoutButton variant="icon" />
            </div>
          </>
        )}
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
