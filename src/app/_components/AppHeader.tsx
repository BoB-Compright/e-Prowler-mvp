"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

function ScanIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.2l5.2 3.8L10 15.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function AssetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01" />
    </svg>
  );
}

function ProjectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function buildTabs(latestRunId: string | null) {
  return [
    { href: "/", label: "점검 실행", icon: <ScanIcon /> },
    { href: "/assets", label: "자산", icon: <AssetIcon /> },
    { href: "/projects", label: "프로젝트", icon: <ProjectIcon /> },
    { href: "/runs", label: "점검 이력", icon: <HistoryIcon /> },
    {
      href: latestRunId ? `/runs/${latestRunId}/report` : "/runs",
      label: "상세 리포트",
      icon: <ReportIcon />,
      matchPrefix: "/runs/",
      matchSuffix: "/report",
    },
    { href: "/catalog", label: "카탈로그", icon: <CatalogIcon /> },
  ];
}

function isActive(pathname: string, tab: ReturnType<typeof buildTabs>[number]): boolean {
  if (tab.matchSuffix) return pathname.endsWith(tab.matchSuffix);
  if (tab.href === "/") return pathname === "/";
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function AppHeader({ latestRunId }: { latestRunId: string | null }) {
  const pathname = usePathname();
  const tabs = buildTabs(latestRunId);

  return (
    <header className="flex h-14 items-center gap-3.5 bg-[var(--color-primary)] px-4 text-white">
      <div>
        <div className="text-[15px] font-bold tracking-tight">Container Security Pipeline</div>
        <div className="font-mono text-[11px] opacity-80">nh-security-scan</div>
      </div>
      <nav className="ml-2 flex gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className={`inline-flex items-center gap-1.5 rounded-[var(--radius-nh)] px-3 py-1.5 text-[12.5px] whitespace-nowrap ${
              isActive(pathname, tab)
                ? "bg-white/20 font-semibold"
                : "text-white/75 hover:bg-white/10"
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <ThemeToggle />
    </header>
  );
}
