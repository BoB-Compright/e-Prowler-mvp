"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_ITEMS, isActiveNav } from "./navItems";

export function AppHeader() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActiveNav(pathname, item));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <div className="min-w-0 md:hidden">
          <div className="truncate text-[15px] font-bold tracking-tight text-primary">NH-Guardian</div>
        </div>
        <div className="hidden text-[13px] text-muted md:block">
          {current ? current.label : "e-Prowler"}
        </div>
        <div className="flex-1" />
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
