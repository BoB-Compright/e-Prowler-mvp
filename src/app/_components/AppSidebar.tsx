"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActiveNav } from "./navItems";
import { BrandLogo } from "./BrandLogo";

// 온보딩 투어 앵커: 내비 href → data-tour 값. 투어 스텝(steps.ts)의 anchor와 일치해야 한다.
const NAV_TOUR_ANCHORS: Record<string, string | undefined> = {
  "/": "nav-dashboard",
  "/projects": "nav-projects",
  "/runs": "nav-runs",
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
    </aside>
  );
}
