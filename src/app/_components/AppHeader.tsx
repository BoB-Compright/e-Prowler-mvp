"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/", label: "점검 실행" },
  { href: "/runs", label: "점검 이력" },
  { href: "/catalog", label: "카탈로그" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center gap-3.5 bg-[var(--color-primary)] px-4 text-white">
      <div>
        <div className="text-[15px] font-bold tracking-tight">Container Security Pipeline</div>
        <div className="font-mono text-[11px] opacity-80">nh-security-scan</div>
      </div>
      <nav className="ml-2 flex gap-1">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-[var(--radius-nh)] px-3 py-1.5 text-[12.5px] whitespace-nowrap ${
              isActive(pathname, tab.href)
                ? "bg-white/20 font-semibold"
                : "text-white/75 hover:bg-white/10"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <ThemeToggle />
    </header>
  );
}
