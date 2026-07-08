# 자산 중심 UX 정합화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈을 자산 전체의 보안 현황 대시보드로 교체하고, 자산 상세를 점검 실행·이력·스케줄·CVE의 허브로 만들며, "점검 실행"/"상세 리포트" 탭 제거와 레포 중심 용어 정리를 수행한다.

**Architecture:** 신규 store 함수·API 없이 기존 lib 함수(`listAssets`, `listRuns`, `getRunRiskSummary`, `overallRunOutcome`, `listCveMatches`, `getScheduleByAsset`, `getProject`)를 서버 컴포넌트에서 직접 조합한다(스펙의 접근 A). 자산당 N+1 조회는 기수용 트레이드오프. 클라이언트 컴포넌트는 인터랙션이 필요한 2개만 신설: `StartScanButton`(자산 상세), `LocalImageFallbackForm`(대시보드, 기존 StartRunForm에서 분리).

**Tech Stack:** 기존과 동일 (Next.js 16 App Router / React 19 / TypeScript strict / Tailwind v4 + `var(--color-*)` CSS 변수). 신규 의존성 없음.

## Global Constraints

- 페이지(서버 컴포넌트)와 클라이언트 UI 컴포넌트에는 테스트 파일을 만들지 않는다 (코드베이스 관례). 수용 기준은 `npx tsc --noEmit` 클린 + dev 서버 curl/수동 검증 + 기존 전체 스위트 회귀 없음.
- 신규 집계 store 함수, 신규 API 엔드포인트를 만들지 않는다 (스펙 접근 A).
- 스타일은 기존 관례를 따른다: 이름 있는 함수 컴포넌트, Tailwind + `var(--color-*)`, `rounded-[var(--radius-nh)]`, 인터랙션만 client 컴포넌트로 분리. `OUTCOME_COLOR` 같은 소형 상수는 기존 `/runs` 페이지처럼 페이지별 중복을 허용한다 (범용 컴포넌트 라이브러리 신설 금지).
- CVE 심각도 값은 소문자(`"critical" | "high" | "medium" | "low" | "unknown"`), 점검 심각도는 대문자(`"Critical" | "High" | ...`) — 혼동 주의.
- `listCveMatches(assetId)`는 dismissed 포함 전체를 반환한다(cvss 내림차순) — 대시보드에서는 `!m.dismissed`로 걸러야 한다.
- API 에러 메시지·UI 문구는 한국어.
- 각 태스크에서 dev 서버로 검증한 뒤에는 반드시 서버 프로세스를 종료한다.
- 커밋 전 반드시 `git branch --show-current`가 작업 브랜치(main 아님)인지 확인한다.

---

### Task 1: 네비게이션 정리 (6탭 → 5탭) + 헤더 타이틀

**Files:**
- Modify: `src/app/_components/AppHeader.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `AppHeader()` — prop 없는 시그니처로 변경 (기존 `{ latestRunId }` prop 제거). layout.tsx가 이 변경에 맞춰 수정됨. 이후 태스크는 이 헤더 구조를 전제.

- [ ] **Step 1: AppHeader.tsx 수정**

전체 교체 코드. 변경점: ① `ScanIcon`→`DashboardIcon`(4분할 그리드), ② `ReportIcon`과 "상세 리포트" 탭 제거, ③ "점검 실행"→"대시보드", ④ `latestRunId` prop/`buildTabs` 파라미터/`matchSuffix` 로직 제거, ⑤ 타이틀 교체.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

function DashboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
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

const TABS = [
  { href: "/", label: "대시보드", icon: <DashboardIcon /> },
  { href: "/assets", label: "자산", icon: <AssetIcon /> },
  { href: "/projects", label: "프로젝트", icon: <ProjectIcon /> },
  { href: "/runs", label: "점검 이력", icon: <HistoryIcon /> },
  { href: "/catalog", label: "카탈로그", icon: <CatalogIcon /> },
];

function isActive(pathname: string, tab: (typeof TABS)[number]): boolean {
  if (tab.href === "/") return pathname === "/";
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center gap-3.5 bg-[var(--color-primary)] px-4 text-white">
      <div>
        <div className="text-[15px] font-bold tracking-tight">e-Prowler — 자산 보안 점검</div>
        <div className="font-mono text-[11px] opacity-80">nh-security-scan</div>
      </div>
      <nav className="ml-2 flex gap-1">
        {TABS.map((tab) => (
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
```

- [ ] **Step 2: layout.tsx 수정**

`latestRunId` 계산과 `listRuns` import를 제거하고, metadata 타이틀을 교체한다:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "./_components/ThemeScript";
import { AppHeader } from "./_components/AppHeader";

// DESIGN.md's documented substitute for the licensed CoinbaseSans/Display typefaces.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "e-Prowler — 자산 보안 점검",
  description: "자산(레포·서버) 보안 점검 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-theme="light" className={`h-full antialiased ${inter.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (AppHeader prop 제거가 layout까지 일관되게 반영됐는지 확인)

- [ ] **Step 4: dev 서버 검증**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:3000/ | grep -o "대시보드" | head -1
curl -s http://localhost:3000/ | grep -c "상세 리포트" || echo "0 (탭 제거 확인)"
curl -s http://localhost:3000/ | grep -o "e-Prowler" | head -1
kill $DEV_PID
```
Expected: "대시보드" 출력, "상세 리포트" 0건, "e-Prowler" 출력.

- [ ] **Step 5: 전체 스위트 + 커밋**

```bash
npm test
git add src/app/_components/AppHeader.tsx src/app/layout.tsx
git commit -m "feat: 네비게이션을 5탭으로 정리 (점검 실행·상세 리포트 탭 제거, 대시보드 신설)"
```

---

### Task 2: 자산 허브 — 점검 시작 버튼 + 이력 개선 + 프로젝트 링크

**Files:**
- Create: `src/app/assets/[id]/StartScanButton.tsx`
- Modify: `src/app/assets/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/runs { assetId }` (기존 API — 응답 `{ run: { id } }`, 에러 시 `{ error }`), `getProject` (`@/lib/projects/store`), `getRunRiskSummary` (`@/lib/checks/riskSummaryStore`), `overallRunOutcome`, `RunOutcome` (`@/lib/checks/riskSummary`)
- Produces: `StartScanButton({ assetId }: { assetId: string })` — 다른 태스크가 소비하지 않는 leaf

- [ ] **Step 1: StartScanButton.tsx 생성**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartScanButton({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "점검을 시작하지 못했습니다");
        return;
      }
      router.push(`/runs/${data.run.id}`);
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={start}
        disabled={submitting}
        className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold whitespace-nowrap text-white hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "시작 중…" : "점검 시작"}
      </button>
      {error && <p className="max-w-52 text-right text-xs text-[var(--color-fail)]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: page.tsx 재구성**

전체 교체:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAsset } from "@/lib/assets/store";
import { getProject } from "@/lib/projects/store";
import { listRuns } from "@/lib/pipeline/runs";
import { listCveMatches } from "@/lib/cve/store";
import { CveList } from "./CveList";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { ScheduleForm } from "./ScheduleForm";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { StartScanButton } from "./StartScanButton";

const OUTCOME_COLOR: Record<RunOutcome, string> = {
  fail: "var(--color-fail)",
  review: "var(--color-review)",
  pass: "var(--color-pass)",
};

const OUTCOME_LABEL: Record<RunOutcome, string> = { fail: "취약", review: "검토", pass: "양호" };

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) notFound();

  const project = asset.projectId ? getProject(asset.projectId) : undefined;
  const runs = listRuns().filter((run) => run.assetId === id);
  const schedule = getScheduleByAsset(id) ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            {asset.displayName}
            <span className="rounded-[var(--radius-nh)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-normal text-[var(--color-muted)]">
              {asset.type === "repo" ? "레포" : "서버"}
            </span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {asset.type === "repo" ? asset.repoUrl : `${asset.hostIp}:${asset.sshPort}`}
            {" · "}
            {project ? (
              <Link href={`/projects/${project.id}`} className="text-[var(--color-primary)] hover:underline">
                {project.name}
              </Link>
            ) : (
              "미분류"
            )}
          </p>
        </div>
        <StartScanButton assetId={id} />
      </div>

      <div className="mb-6">
        <ScheduleForm assetId={id} initialSchedule={schedule} />
      </div>
      {asset.type === "server" && (
        <div className="mb-6">
          <CveList matches={listCveMatches(id)} />
        </div>
      )}
      <h2 className="mb-2 text-sm font-bold">점검 이력</h2>
      {runs.length === 0 ? (
        <p className="text-[13px] text-[var(--color-muted)] italic">
          아직 점검 이력이 없습니다 — 우측 상단의 점검 시작 버튼으로 첫 점검을 실행하세요.
        </p>
      ) : (
        <ul className="text-sm">
          {runs.map((run) => {
            const summary = getRunRiskSummary(run.id);
            const outcome = overallRunOutcome(summary);
            const color = OUTCOME_COLOR[outcome];
            return (
              <li key={run.id} className="border-b border-[var(--color-border)]">
                <Link
                  href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                  className="flex items-center gap-3 py-2 hover:bg-[var(--color-surface)]"
                >
                  <span className="font-mono text-xs text-[var(--color-muted)]">
                    {formatTimestamp(run.createdAt)}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {run.triggerType === "scheduled" ? "예약" : "수동"}
                  </span>
                  {run.status === "running" ? (
                    <span className="text-[11.5px] font-semibold text-[var(--color-primary)]">진행 중</span>
                  ) : run.status === "failed" ? (
                    <span className="text-[11.5px] font-semibold text-[var(--color-fail)]">실패</span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                    >
                      {OUTCOME_LABEL[outcome]}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs text-[var(--color-muted)]">
                    C {summary.severityCounts.Critical} · H {summary.severityCounts.High}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

주의: run이 `failed`면 check 결과가 없어 `overallRunOutcome`이 `pass`로 나오므로, outcome 배지 대신 "실패" 배지로 분기한다 (위 코드에 반영됨).

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: dev 서버 검증**

```bash
npm run dev &
DEV_PID=$!
sleep 4
ASSET_ID=$(curl -s http://localhost:3000/api/assets | python3 -c "import json,sys; a=json.load(sys.stdin).get('assets') or []; print(a[0]['id'] if a else '')")
curl -s "http://localhost:3000/assets/$ASSET_ID" | grep -o "점검 시작" | head -1
curl -s "http://localhost:3000/assets/$ASSET_ID" | grep -o "미분류\|프로젝트" | head -1
kill $DEV_PID
```
Expected: "점검 시작" 버튼과 프로젝트/미분류 표기가 렌더링됨. (로컬 DB에 자산이 없으면 `/assets/new`에서 하나 등록 후 재시도)

- [ ] **Step 5: 전체 스위트 + 커밋**

```bash
npm test
git add "src/app/assets/[id]/StartScanButton.tsx" "src/app/assets/[id]/page.tsx"
git commit -m "feat: 자산 상세를 허브로 개편 (점검 시작 버튼, 이력 배지·링크, 프로젝트 링크)"
```

---

### Task 3: 홈 대시보드 (page.tsx 교체 + local_image 폴백 분리)

**Files:**
- Create: `src/app/LocalImageFallbackForm.tsx`
- Modify: `src/app/page.tsx` (전체 교체)
- Delete: `src/app/StartRunForm.tsx`

**Interfaces:**
- Consumes: `listAssets`, `listRuns`, `listCveMatches`, `getScheduleByAsset`, `getRunRiskSummary`, `overallRunOutcome`, `getRepoDisplayName` (`@/lib/pipeline/repoUrl`), `GET /api/local-images`, `POST /api/runs { imageTag }` (모두 기존)
- Produces: 없음 (leaf)

- [ ] **Step 1: LocalImageFallbackForm.tsx 생성**

기존 `StartRunForm`의 local_image 모드를 접이식(기본 접힘)으로 분리:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LocalImage {
  tag: string;
  id: string;
  size: string;
  createdSince: string;
}

export function LocalImageFallbackForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [imageTag, setImageTag] = useState("");
  const [localImages, setLocalImages] = useState<LocalImage[] | null>(null);
  const [localImagesError, setLocalImagesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Docker 이미지 목록 조회는 섹션을 펼쳤을 때만 (docker CLI shell-out 비용)
  useEffect(() => {
    if (!open || localImages !== null) return;
    fetch("/api/local-images")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setLocalImagesError(data.error);
          return;
        }
        setLocalImages(data.images);
      })
      .catch(() => setLocalImagesError("로컬 이미지 목록을 불러올 수 없습니다"));
  }, [open, localImages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageTag }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "점검을 시작하지 못했습니다");
        return;
      }
      router.push(`/runs/${data.run.id}`);
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-10 rounded-[var(--radius-nh)] border border-[var(--color-border)] p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        {open ? "▾" : "▸"} 로컬 이미지 재점검 (Fallback)
      </button>
      {open && (
        <>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              required
              value={imageTag}
              onChange={(e) => setImageTag(e.target.value)}
              disabled={!localImages || localImages.length === 0}
              className="flex-1 rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
            >
              <option value="" disabled>
                {localImagesError
                  ? "로컬 이미지 목록을 불러올 수 없습니다"
                  : localImages === null
                    ? "불러오는 중…"
                    : localImages.length === 0
                      ? "로컬에 존재하는 이미지가 없습니다"
                      : "이미지 선택"}
              </option>
              {localImages?.map((image) => (
                <option key={image.tag} value={image.tag}>
                  {image.tag} ({image.size}, {image.createdSince})
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting || !imageTag}
              className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "시작 중…" : "점검 시작"}
            </button>
          </form>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            GitHub clone 또는 Docker Build가 실패할 때, 이미 빌드된 로컬 이미지로 Sandbox 실행부터 재개합니다.
          </p>
          {error && <p className="mt-2 text-sm text-[var(--color-fail)]">{error}</p>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: page.tsx를 대시보드로 전체 교체**

```tsx
import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { listCveMatches } from "@/lib/cve/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import type { Run } from "@/lib/pipeline/types";
import { LocalImageFallbackForm } from "./LocalImageFallbackForm";

const OUTCOME_COLOR: Record<RunOutcome, string> = {
  fail: "var(--color-fail)",
  review: "var(--color-review)",
  pass: "var(--color-pass)",
};

const OUTCOME_LABEL: Record<RunOutcome, string> = { fail: "취약", review: "검토", pass: "양호" };

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

const SCHEDULE_LABEL: Record<string, string> = { daily: "매일", weekly: "매주", monthly: "매월" };

export default function DashboardPage() {
  const assets = listAssets();
  const allRuns = listRuns(); // 최신순 정렬 보장 (created_at DESC)

  // 자산별 마지막 run (allRuns가 최신순이므로 첫 등장 = 최신)
  const latestRunByAsset = new Map<string, Run>();
  for (const run of allRuns) {
    if (run.assetId && !latestRunByAsset.has(run.assetId)) {
      latestRunByAsset.set(run.assetId, run);
    }
  }

  const rows = assets.map((asset) => {
    const lastRun = latestRunByAsset.get(asset.id);
    const summary = lastRun && lastRun.status !== "running" ? getRunRiskSummary(lastRun.id) : null;
    const outcome =
      lastRun && lastRun.status === "succeeded" && summary ? overallRunOutcome(summary) : null;
    const schedule = getScheduleByAsset(asset.id);
    const openCveCount =
      asset.type === "server"
        ? listCveMatches(asset.id).filter((m) => !m.dismissed).length
        : null;
    return { asset, lastRun, summary, outcome, schedule, openCveCount };
  });

  const repoCount = assets.filter((a) => a.type === "repo").length;
  const serverCount = assets.length - repoCount;
  const vulnerableCount = rows.filter((row) => row.outcome === "fail").length;
  const activeScheduleCount = rows.filter((row) => row.schedule?.enabled).length;

  const openCves = assets
    .filter((a) => a.type === "server")
    .flatMap((a) =>
      listCveMatches(a.id)
        .filter((m) => !m.dismissed)
        .map((m) => ({ ...m, assetName: a.displayName })),
    );
  const criticalHighCves = openCves.filter(
    (m) => m.severity === "critical" || m.severity === "high",
  );
  const topCves = [...criticalHighCves]
    .sort((x, y) => (y.cvssScore ?? 0) - (x.cvssScore ?? 0))
    .slice(0, 5);

  const recentRuns = allRuns.slice(0, 8);
  const assetNameById = new Map(assets.map((a) => [a.id, a.displayName]));

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">대시보드</h1>
          <p className="text-xs text-[var(--color-muted)]">등록 자산 전체의 보안 현황 요약</p>
        </div>
        <Link
          href="/assets/new"
          className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white"
        >
          자산 등록
        </Link>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">등록된 자산이 없습니다.</p>
          <Link
            href="/assets/new"
            className="mt-3 inline-block rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            첫 자산 등록하기
          </Link>
        </div>
      ) : (
        <>
          {/* 1. 지표 카드 줄 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">총 자산</div>
              <div className="mt-1 text-2xl font-bold">{assets.length}</div>
              <div className="text-xs text-[var(--color-muted)]">레포 {repoCount} · 서버 {serverCount}</div>
            </div>
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">취약 자산</div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{ color: vulnerableCount > 0 ? "var(--color-fail)" : undefined }}
              >
                {vulnerableCount}
              </div>
              <div className="text-xs text-[var(--color-muted)]">마지막 점검 결과 취약</div>
            </div>
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">미해결 CVE</div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{ color: criticalHighCves.length > 0 ? "var(--color-fail)" : undefined }}
              >
                {openCves.length}
              </div>
              <div className="text-xs text-[var(--color-muted)]">Critical·High {criticalHighCves.length}</div>
            </div>
            <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[11px] text-[var(--color-muted)] uppercase">활성 스케줄</div>
              <div className="mt-1 text-2xl font-bold">{activeScheduleCount}</div>
              <div className="text-xs text-[var(--color-muted)]">정기 점검 자산</div>
            </div>
          </div>

          {/* 2. 위험 CVE */}
          <section className="mt-8">
            <h2 className="text-sm font-bold">위험 CVE (Critical·High)</h2>
            {topCves.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--color-muted)] italic">위험 CVE 없음</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-nh)] border border-[var(--color-border)]">
                {topCves.map((cve) => (
                  <li key={cve.id}>
                    <Link
                      href={`/assets/${cve.assetId}`}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                    >
                      <span className="font-mono font-bold text-[var(--color-fail)]">{cve.cveId}</span>
                      <span className="text-[var(--color-muted)]">{cve.assetName}</span>
                      <span className="font-mono text-xs text-[var(--color-muted)]">
                        {cve.packageName}@{cve.packageVersion}
                      </span>
                      <span className="ml-auto font-mono text-xs font-bold">
                        {cve.cvssScore != null ? `CVSS ${cve.cvssScore.toFixed(1)}` : cve.severity.toUpperCase()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. 자산별 보안 현황 */}
          <section className="mt-8">
            <h2 className="text-sm font-bold">자산별 보안 현황</h2>
            <div className="mt-2 overflow-hidden rounded-[var(--radius-nh)] border border-[var(--color-border)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
                    <th className="px-3 py-2 font-mono text-[11px] uppercase">자산</th>
                    <th className="px-3 py-2 font-mono text-[11px] uppercase">타입</th>
                    <th className="px-3 py-2 font-mono text-[11px] uppercase">마지막 점검</th>
                    <th className="px-2 py-2 text-center font-mono text-[11px] uppercase">C/H</th>
                    <th className="px-2 py-2 text-center font-mono text-[11px] uppercase">정기 점검</th>
                    <th className="px-2 py-2 text-center font-mono text-[11px] uppercase">CVE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ asset, lastRun, summary, outcome, schedule, openCveCount }) => (
                    <tr key={asset.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                      <td className="px-3 py-2">
                        <Link href={`/assets/${asset.id}`} className="font-semibold text-[var(--color-primary)] hover:underline">
                          {asset.displayName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{asset.type === "repo" ? "레포" : "서버"}</td>
                      <td className="px-3 py-2">
                        {!lastRun ? (
                          <span className="text-xs text-[var(--color-muted)] italic">점검 이력 없음</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs text-[var(--color-muted)]">
                              {formatTimestamp(lastRun.updatedAt)}
                            </span>
                            {lastRun.status === "running" ? (
                              <span className="text-[11px] font-semibold text-[var(--color-primary)]">진행 중</span>
                            ) : lastRun.status === "failed" ? (
                              <span className="text-[11px] font-semibold text-[var(--color-fail)]">실패</span>
                            ) : outcome ? (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background: `color-mix(in srgb, ${OUTCOME_COLOR[outcome]} 16%, transparent)`,
                                  color: OUTCOME_COLOR[outcome],
                                }}
                              >
                                {OUTCOME_LABEL[outcome]}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-xs">
                        {summary ? `${summary.severityCounts.Critical}/${summary.severityCounts.High}` : "—"}
                      </td>
                      <td className="px-2 py-2 text-center text-xs">
                        {schedule?.enabled ? SCHEDULE_LABEL[schedule.frequency] : "—"}
                      </td>
                      <td
                        className="px-2 py-2 text-center font-mono text-xs"
                        style={{ color: openCveCount ? "var(--color-fail)" : undefined }}
                      >
                        {openCveCount == null ? "—" : openCveCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 4. 최근 점검 활동 */}
          <section className="mt-8">
            <h2 className="text-sm font-bold">최근 점검 활동</h2>
            {recentRuns.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--color-muted)] italic">아직 실행된 점검이 없습니다.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-nh)] border border-[var(--color-border)]">
                {recentRuns.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                    >
                      <span className="font-semibold">
                        {(run.assetId && assetNameById.get(run.assetId)) ?? getRepoDisplayName(run.repoUrl)}
                      </span>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        {run.triggerType === "scheduled" ? "예약" : "수동"}
                      </span>
                      <span
                        className="text-[11px] font-semibold"
                        style={{
                          color:
                            run.status === "failed"
                              ? "var(--color-fail)"
                              : run.status === "running"
                                ? "var(--color-primary)"
                                : "var(--color-pass)",
                        }}
                      >
                        {run.status === "running" ? "진행 중" : run.status === "failed" ? "실패" : "완료"}
                      </span>
                      <span className="ml-auto font-mono text-xs text-[var(--color-muted)]">
                        {formatTimestamp(run.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <LocalImageFallbackForm />
    </main>
  );
}
```

- [ ] **Step 3: StartRunForm.tsx 삭제**

```bash
git rm src/app/StartRunForm.tsx
```

(대시보드 교체로 유일한 사용처가 사라짐. local_image 기능은 Step 1의 `LocalImageFallbackForm`이 승계.)

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (StartRunForm 참조가 완전히 사라졌는지 이 단계에서 확인됨)

- [ ] **Step 5: dev 서버 검증**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:3000/ | grep -o "자산별 보안 현황" | head -1
curl -s http://localhost:3000/ | grep -o "총 자산" | head -1
curl -s http://localhost:3000/ | grep -o "최근 점검 활동" | head -1
curl -s http://localhost:3000/ | grep -o "로컬 이미지 재점검" | head -1
kill $DEV_PID
```
Expected: 4개 문자열 모두 출력.

- [ ] **Step 6: 전체 스위트 + 커밋**

```bash
npm test
git add src/app/page.tsx src/app/LocalImageFallbackForm.tsx
git commit -m "feat: 홈을 자산 보안 현황 대시보드로 교체 (지표·CVE·자산 현황·활동 피드)"
```

---

### Task 4: 레포 중심 용어 정리 (`/runs`)

**Files:**
- Modify: `src/app/runs/page.tsx`

**Interfaces:**
- Consumes/Produces: 없음 (문구만 수정)

- [ ] **Step 1: 문구 4곳 수정**

`src/app/runs/page.tsx`에서 아래 4곳을 정확히 치환한다 (구조/클래스 변경 없음):

1. 부제:
```
[전] <span className="text-xs text-[var(--color-muted)]">레포별 최근 점검 결과 · 심각도 요약 비교</span>
[후] <span className="text-xs text-[var(--color-muted)]">자산별 최근 점검 결과 · 심각도 요약 비교</span>
```

2. 빈 상태 문구 ("점검 실행" 탭이 사라졌으므로 필수 수정):
```
[전] 아직 실행된 점검이 없습니다 — 점검 실행 탭에서 레포 URL을 입력해 첫 점검을 시작하세요.
[후] 아직 실행된 점검이 없습니다 — 자산 탭에서 자산을 등록해 첫 점검을 시작하세요.
```

3. 테이블 헤더:
```
[전] 레포지토리
[후] 점검 대상
```

4. 필터 툴팁:
```
[전] title="이 레포의 이력만 보기"
[후] title="이 자산의 이력만 보기"
```

추가로 같은 파일 안에 "이력만 표시 중" 부근 등 "레포"라는 단어가 남아 있으면 사용자 노출 문구에 한해 "자산"으로 통일한다 (변수명·주석은 건드리지 않음).

- [ ] **Step 2: 타입체크 + dev 서버 검증**

```bash
npx tsc --noEmit
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:3000/runs | grep -o "점검 대상" | head -1
curl -s http://localhost:3000/runs | grep -c "레포지토리" || echo "0 (치환 확인)"
kill $DEV_PID
```
Expected: "점검 대상" 출력, "레포지토리" 0건.

- [ ] **Step 3: 전체 스위트 + 커밋**

```bash
npm test
git add src/app/runs/page.tsx
git commit -m "fix: 점검 이력 화면의 레포 중심 용어를 자산 중심으로 정리"
```
