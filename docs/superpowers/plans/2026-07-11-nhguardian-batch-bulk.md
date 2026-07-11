# NH-Guardian 명칭·배치 가시성·자산 일괄 작업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** e-Prowler 명칭을 NH-Guardian으로 통일하고, 일괄 점검의 단계별 진행 상황을 보이게 하고, 자산 목록에서 일괄 선택·일괄 작업(점검/프로젝트 이동/스케줄/삭제)을 제공한다.

**Architecture:** 진행률 계산(`runProgress`)과 벌크 스캔 오케스트레이션(`startAssetsBulkScan`)은 lib 순수/서비스 함수로 분리해 테스트하고, UI는 기존 배치 페이지 확장 + 자산 테이블의 클라이언트 컴포넌트 추출로 구현한다. 벌크 API 4종은 기존 store·파이프라인 함수를 재사용하는 얇은 라우트다.

**Tech Stack:** Next.js App Router, better-sqlite3, vitest, 기존 AutoRefresh 폴링.

**Spec:** `docs/superpowers/specs/2026-07-11-nhguardian-batch-bulk-design.md`

## Global Constraints

- 테스트/빌드는 Node 24: 모든 명령 앞에 `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` (기본 node 18은 vitest 불가).
- 커밋 메시지: `feat|fix|docs: 한국어 요약 (#nhguardian-batch-bulk)` + 트레일러 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- UI 문구는 한국어. 신규 API는 전부 `requireApiSession` 가드 필수.
- 부분 실패는 조용히 삼키지 않는다 — 응답과 UI에 성공/건너뜀 내역을 보고한다.
- GitHub 리포 URL(`e-Prowler-mvp`)·과거 스펙/플랜 문서의 명칭은 변경하지 않는다.
- 쿠키명 변경(`eprowler_session`→`nhg_session`)으로 기존 로그인 세션이 1회 만료되는 것은 의도된 동작.

---

### Task 1: NH-Guardian 명칭 통일

**Files:**
- Modify: `src/app/layout.tsx:16`
- Modify: `src/app/_components/AppHeader.tsx:36`
- Modify: `src/app/_components/AppSidebar.tsx:14`
- Modify: `src/app/login/LoginForm.tsx:38`
- Modify: `src/lib/auth/constants.ts:6`
- Modify: `docs/adr/0001-authentication-local-accounts.md:87`
- Modify: `README.md` (본문 명칭 서술만 — 클론 URL·이슈 링크는 유지)

**Interfaces:**
- Consumes: 없음
- Produces: `SESSION_COOKIE_NAME = "nhg_session"` (모든 인증 코드·테스트는 이 상수를 import하므로 자동 반영)

- [ ] **Step 1: 소스 5곳 문자열 교체**

각 파일에서 정확히 다음으로 교체:

```
src/app/layout.tsx:16
  title: "e-Prowler — 자산 보안 점검",  →  title: "NH-Guardian — 자산 보안 점검",

src/app/_components/AppHeader.tsx:36
  {current ? current.label : "e-Prowler"}  →  {current ? current.label : "NH-Guardian"}

src/app/_components/AppSidebar.tsx:14
  <div className="font-mono text-[11px] text-muted">e-Prowler · 자산 보안 점검</div>
  →  <div className="font-mono text-[11px] text-muted">자산 보안 점검</div>

src/app/login/LoginForm.tsx:38
  e-Prowler 계정으로 로그인하세요.  →  NH-Guardian 계정으로 로그인하세요.

src/lib/auth/constants.ts:6
  export const SESSION_COOKIE_NAME = "eprowler_session";
  →  export const SESSION_COOKIE_NAME = "nhg_session";
```

- [ ] **Step 2: 문서 2곳 교체**

`docs/adr/0001-authentication-local-accounts.md:87`의 `eprowler_session=garbage` → `nhg_session=garbage`.
`README.md`에서 클론 URL(33·34행)과 이슈 링크(269행)를 **제외한** 본문의 e-Prowler 명칭 서술을 NH-Guardian으로 교체 (`grep -n "e-Prowler\|eprowler" README.md`로 대상 확인 — 도구/제품 명칭으로 쓰인 곳만).

- [ ] **Step 3: 잔여 검증 + 전체 테스트**

Run:
```bash
grep -rn "e-Prowler\|eprowler" src/ && echo "FAIL: 잔여 있음" || echo "src clean"
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run 2>&1 | tail -3
```
Expected: "src clean", 748/748 PASS (인증 테스트는 SESSION_COOKIE_NAME 상수를 import하므로 통과).

- [ ] **Step 4: 커밋**

```bash
git add src/app/layout.tsx src/app/_components/AppHeader.tsx src/app/_components/AppSidebar.tsx \
  src/app/login/LoginForm.tsx src/lib/auth/constants.ts docs/adr/0001-authentication-local-accounts.md README.md
git commit -m "feat: e-Prowler 명칭을 NH-Guardian으로 통일 (#nhguardian-batch-bulk)"
```

---

### Task 2: runProgress 순수 함수

**Files:**
- Create: `src/lib/pipeline/runProgress.ts`
- Test: `src/lib/pipeline/runProgress.test.ts`

**Interfaces:**
- Consumes: `Run` 타입 (`@/lib/pipeline/types` — `stage: Stage`, `sourceType: "git" | "local_image" | "server"`)
- Produces: `interface RunProgress { label: string; fraction: number }`, `function runProgress(run: Pick<Run, "stage" | "sourceType">): RunProgress`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/pipeline/runProgress.test.ts
import { describe, expect, it } from "vitest";
import { runProgress } from "./runProgress";

describe("runProgress", () => {
  it("컨테이너(git) 경로: 6단계 순번/6", () => {
    expect(runProgress({ stage: "clone", sourceType: "git" })).toEqual({ label: "클론", fraction: 1 / 6 });
    expect(runProgress({ stage: "build", sourceType: "git" })).toEqual({ label: "빌드", fraction: 2 / 6 });
    expect(runProgress({ stage: "claude", sourceType: "git" })).toEqual({ label: "AI 분석", fraction: 1 });
  });

  it("local_image 경로: clone/build 없이 4단계", () => {
    expect(runProgress({ stage: "sandbox", sourceType: "local_image" })).toEqual({
      label: "샌드박스 준비",
      fraction: 1 / 4,
    });
    expect(runProgress({ stage: "ansible", sourceType: "local_image" })).toEqual({
      label: "Ansible 점검",
      fraction: 2 / 4,
    });
  });

  it("서버 경로: 4단계", () => {
    expect(runProgress({ stage: "connect", sourceType: "server" })).toEqual({ label: "SSH 연결", fraction: 1 / 4 });
    expect(runProgress({ stage: "ansible_scan", sourceType: "server" })).toEqual({
      label: "Ansible 점검",
      fraction: 2 / 4,
    });
    expect(runProgress({ stage: "claude_analysis", sourceType: "server" })).toEqual({
      label: "AI 분석",
      fraction: 1,
    });
  });

  it("done은 경로와 무관하게 완료·1.0", () => {
    expect(runProgress({ stage: "done", sourceType: "git" })).toEqual({ label: "완료", fraction: 1 });
    expect(runProgress({ stage: "done", sourceType: "server" })).toEqual({ label: "완료", fraction: 1 });
  });

  it("경로에 없는 stage는 라벨만 출력하고 fraction 0 (방어)", () => {
    expect(runProgress({ stage: "clone", sourceType: "server" })).toEqual({ label: "클론", fraction: 0 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/runProgress.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// src/lib/pipeline/runProgress.ts
import type { Run } from "./types";

export interface RunProgress {
  label: string;
  fraction: number; // 0~1, done = 1
}

// 경로별 작업 단계 순서 (done 제외). fraction = 현재 단계 순번(1-base) / 전체 단계 수.
const CONTAINER_STAGES = ["clone", "build", "sandbox", "ansible", "rule_eval", "claude"] as const;
const LOCAL_IMAGE_STAGES = ["sandbox", "ansible", "rule_eval", "claude"] as const;
const SERVER_STAGES = ["connect", "ansible_scan", "rule_evaluation", "claude_analysis"] as const;

const STAGE_LABEL: Record<string, string> = {
  clone: "클론",
  build: "빌드",
  sandbox: "샌드박스 준비",
  ansible: "Ansible 점검",
  rule_eval: "규칙 평가",
  claude: "AI 분석",
  connect: "SSH 연결",
  ansible_scan: "Ansible 점검",
  rule_evaluation: "규칙 평가",
  claude_analysis: "AI 분석",
  done: "완료",
};

export function runProgress(run: Pick<Run, "stage" | "sourceType">): RunProgress {
  if (run.stage === "done") return { label: "완료", fraction: 1 };
  const order: readonly string[] =
    run.sourceType === "server"
      ? SERVER_STAGES
      : run.sourceType === "local_image"
        ? LOCAL_IMAGE_STAGES
        : CONTAINER_STAGES;
  const index = order.indexOf(run.stage);
  const label = STAGE_LABEL[run.stage] ?? run.stage;
  // 경로에 없는 stage(신규 단계 추가 등)는 진행률을 추정하지 않는다.
  if (index < 0) return { label, fraction: 0 };
  return { label, fraction: (index + 1) / order.length };
}
```

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/runProgress.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/pipeline/runProgress.ts src/lib/pipeline/runProgress.test.ts
git commit -m "feat: run 단계→진행률 변환 함수 runProgress (#nhguardian-batch-bulk)"
```

---

### Task 3: 배치 페이지 진행 UI

**Files:**
- Modify: `src/app/runs/batch/[batchId]/page.tsx` (전면 교체)

**Interfaces:**
- Consumes: `runProgress` (Task 2), 기존 `AutoRefresh`(`src/app/_components/AutoRefresh.tsx`, props `{ active: boolean }`), `listRunsByBatch`, `runDisplayIdentity`, `getRunRiskSummary`, `overallRunOutcome`, `CHECK_STATUS_LABELS`, `Card`/`SectionLabel`/`StatusBadge`
- Produces: 진행 중 배치의 단계·진행률 표시 (UI만 — 후속 태스크가 의존하는 인터페이스 없음)

- [ ] **Step 1: 페이지 전면 교체**

```tsx
// src/app/runs/batch/[batchId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { listRunsByBatch } from "@/lib/pipeline/scanBatches";
import { listAssets } from "@/lib/assets/store";
import { runDisplayIdentity } from "@/lib/pipeline/runIdentity";
import { runProgress } from "@/lib/pipeline/runProgress";
import { overallRunOutcome, type RunOutcome } from "@/lib/checks/riskSummary";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { CHECK_STATUS_LABELS } from "@/lib/catalog/types";
import { AutoRefresh } from "../../../_components/AutoRefresh";
import { Card } from "../../../_components/Card";
import { SectionLabel } from "../../../_components/SectionLabel";
import { StatusBadge } from "../../../_components/StatusBadge";
import type { BadgeStatus } from "../../../_components/statusBadgeStyles";

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export default async function BatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const runs = listRunsByBatch(batchId);
  if (runs.length === 0) notFound();

  const assetsById = new Map(listAssets().map((a) => [a.id, a]));
  const runningRuns = runs.filter((run) => run.status === "running");
  const finishedCount = runs.length - runningRuns.length;
  // 전체 진행률 = (종료 run 수 + 진행 중 run들의 부분 진행 합) / 전체
  const overallFraction =
    (finishedCount + runningRuns.reduce((sum, run) => sum + runProgress(run).fraction, 0)) / runs.length;
  const overallPercent = Math.round(overallFraction * 100);

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh active={runningRuns.length > 0} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">일괄 점검 결과</h1>
          <p className="text-[13px] text-muted">
            완료 {finishedCount} / 전체 {runs.length}
            {runningRuns.length > 0 ? ` · ${runningRuns.length}개 진행 중` : ""}
          </p>
        </div>
      </div>

      {runningRuns.length > 0 && (
        <div className="mb-6">
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="font-semibold">전체 진행률</span>
            <span className="font-mono text-muted">{overallPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
      )}

      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3">
                  <SectionLabel>점검 대상</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>진행 단계</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>마지막 갱신</SectionLabel>
                </th>
                <th className="px-5 py-3">
                  <SectionLabel>상태</SectionLabel>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => {
                const summary = getRunRiskSummary(run.id);
                const outcome: RunOutcome = overallRunOutcome(summary);
                const id = runDisplayIdentity(run, assetsById);
                const progress = runProgress(run);
                const badge: { status: BadgeStatus; label: string } =
                  run.status === "running"
                    ? { status: "progress", label: "진행 중" }
                    : run.status === "cancelled"
                      ? { status: "neutral", label: "취소됨" }
                      : run.status === "failed"
                        ? { status: "fail", label: "실패" }
                        : { status: outcome, label: CHECK_STATUS_LABELS[outcome] };
                return (
                  <tr key={run.id} className="hover:bg-bg">
                    <td className="px-5 py-3">
                      <Link
                        href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                        className="font-mono font-bold hover:underline"
                      >
                        {id.label}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {run.status === "running" ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1 w-24 overflow-hidden rounded-full bg-border">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                            />
                          </span>
                          <span className="text-[13px] text-muted">{progress.label}</span>
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-[13px] text-muted">
                      {formatTimestamp(run.updatedAt)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: 게이트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/runs/batch/[batchId]/page.tsx" && npx vitest run 2>&1 | tail -3`
Expected: 전부 클린, 테스트 753 PASS (Task 2의 +5)

- [ ] **Step 3: 커밋**

```bash
git add "src/app/runs/batch/[batchId]/page.tsx"
git commit -m "feat: 배치 페이지에 단계·진행률·전체 진행바 표시 (#nhguardian-batch-bulk)"
```

---

### Task 4: 활동 피드 단계 라벨

**Files:**
- Modify: `src/lib/dashboard/activityFeed.ts` (`RunFeedInput`에 `stageLabel` 추가, running detail 확장)
- Modify: `src/lib/dashboard/activityFeed.test.ts` (기존 running 기대값 유지 확인 + 신규 케이스)
- Modify: `src/app/page.tsx` (피드 조립에 stageLabel 전달)

**Interfaces:**
- Consumes: `runProgress` (Task 2)
- Produces: `RunFeedInput.stageLabel?: string | null` — running run일 때 detail이 `"점검 진행 중 — {stageLabel}"`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/dashboard/activityFeed.test.ts`의 `buildActivityFeed` describe 안에 추가:

```ts
  it("진행 중 run에 stageLabel이 있으면 detail에 단계를 표시한다", () => {
    const [ev] = buildActivityFeed(
      [
        {
          runId: "r1", assetName: "s", status: "running",
          failCount: null, reviewCount: null, stageLabel: "빌드",
          at: "2026-07-11T10:00:00.000Z",
        },
      ],
      [],
    );
    expect(ev.detail).toBe("점검 진행 중 — 빌드");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/activityFeed.test.ts`
Expected: 신규 케이스만 FAIL ("점검 진행 중" ≠ "점검 진행 중 — 빌드")

- [ ] **Step 3: 구현**

`src/lib/dashboard/activityFeed.ts`에서:

`RunFeedInput`에 필드 추가:
```ts
  stageLabel?: string | null; // running run의 현재 단계 라벨 (runProgress().label)
```

`runEvent`의 running 분기를 다음으로 교체:
```ts
  if (run.status === "running") {
    const detail = run.stageLabel ? `점검 진행 중 — ${run.stageLabel}` : "점검 진행 중";
    return { ...base, href: `/runs/${run.runId}`, detail, tone: "progress" };
  }
```

- [ ] **Step 4: page.tsx 배선**

`src/app/page.tsx`의 피드 조립(`allRuns.slice(0, 20).map(...)`) 반환 객체에 한 줄 추가하고 import 추가:

```ts
import { runProgress } from "@/lib/pipeline/runProgress";
```
```ts
        stageLabel: run.status === "running" ? runProgress(run).label : null,
```

- [ ] **Step 5: 통과 확인 + 게이트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/activityFeed.test.ts && npx tsc --noEmit && npx vitest run 2>&1 | tail -3`
Expected: PASS (8 tests), tsc 클린, 전체 754 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/dashboard/activityFeed.ts src/lib/dashboard/activityFeed.test.ts src/app/page.tsx
git commit -m "feat: 대시보드 활동 피드에 진행 단계 라벨 표시 (#nhguardian-batch-bulk)"
```

---

### Task 5: 벌크 스캔 lib + scan_batches 마이그레이션 + POST /api/assets/bulk/scan

**Files:**
- Modify: `src/lib/db/index.ts` (scan_batches.project_id nullable 마이그레이션 — 기존 ALTER 마이그레이션들 옆)
- Modify: `src/lib/db/index.ts:80` 스키마의 `project_id TEXT NOT NULL REFERENCES projects(id)` → `project_id TEXT REFERENCES projects(id)` (신규 DB용)
- Modify: `src/lib/pipeline/scanBatches.ts` (`createScanBatch(projectId: string | null)`)
- Modify: `src/lib/pipeline/serverScan.ts` (`createRepoRun`에 `export` 추가 — 이동·수정 없음)
- Create: `src/lib/pipeline/bulkScan.ts`
- Test: `src/lib/pipeline/bulkScan.test.ts`
- Create: `src/app/api/assets/bulk/scan/route.ts`
- Test: `src/app/api/assets/bulk/scan/route.test.ts`

**Interfaces:**
- Consumes: `createServerRun`, `runServerScanPipeline`, `runWithConcurrency`, `repoScanConcurrency`, `createRepoRun`, `ServerScanDeps` (serverScan.ts), `createScanBatch`, `getAsset`, `requireApiSession`
- Produces:
  - `interface BulkScanResult { batchId: string | null; startedRunIds: string[]; skipped: string[] }`
  - `function startAssetsBulkScan(assetIds: string[], deps?: ServerScanDeps, db?: Database): BulkScanResult` — 시작 가능 자산 0개면 배치를 만들지 않고 `batchId: null`
  - `POST /api/assets/bulk/scan` `{ assetIds }` → 202 `{ batchId, started, skipped }` | 409(전부 스킵) | 400(빈 입력)

- [ ] **Step 1: 실패하는 lib 테스트 작성**

```ts
// src/lib/pipeline/bulkScan.test.ts
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

// 파이프라인 실행부는 전부 스텁 — 이 테스트는 배치/런 행 생성과 skip 규칙만 검증한다.
// (ServerScanDeps 타입은 vi.resetModules 하에서 값 import 없이 캐스팅으로 충족)
function stubDeps() {
  return {
    runAnsibleForServer: vi.fn().mockResolvedValue([]),
    retryOnConnectionFailure: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    evaluateAllChecks: vi.fn().mockReturnValue([]),
    saveCheckResults: vi.fn(),
    analyzeAndSaveChecks: vi.fn().mockResolvedValue(undefined),
    runPipeline: vi.fn().mockResolvedValue(undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("startAssetsBulkScan", () => {
  it("선택 자산으로 배치를 만들고 run을 배치에 붙인다 (repo+server 혼합)", async () => {
    const { createRepoAsset, createServerAsset } = await import("@/lib/assets/store");
    const { startAssetsBulkScan } = await import("./bulkScan");
    const { getDb } = await import("@/lib/db");

    const repo = createRepoAsset({ displayName: "r1", repoUrl: "https://github.com/x/r1" });
    const server = createServerAsset({
      displayName: "s1", hostIp: "10.0.0.1", sshPort: 22,
      authType: "password", username: "root", secret: "pw",
    });

    const result = startAssetsBulkScan([repo.id, server.id], stubDeps());
    expect(result.batchId).not.toBeNull();
    expect(result.startedRunIds).toHaveLength(2);
    expect(result.skipped).toEqual([]);

    const rows = getDb()
      .prepare(`SELECT asset_id, batch_id FROM runs ORDER BY created_at`)
      .all() as { asset_id: string; batch_id: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.batch_id === result.batchId)).toBe(true);

    const batch = getDb()
      .prepare(`SELECT project_id FROM scan_batches WHERE id = ?`)
      .get(result.batchId) as { project_id: string | null };
    expect(batch.project_id).toBeNull();
  });

  it("실행 중 점검이 있는 자산은 건너뛰고 skipped로 보고한다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const { startAssetsBulkScan } = await import("./bulkScan");

    const busy = createRepoAsset({ displayName: "busy", repoUrl: "https://github.com/x/busy" });
    const idle = createRepoAsset({ displayName: "idle", repoUrl: "https://github.com/x/idle" });
    createRun(busy.repoUrl!, "git", busy.id); // status 'running'으로 생성됨

    const result = startAssetsBulkScan([busy.id, idle.id], stubDeps());
    expect(result.skipped).toEqual([busy.id]);
    expect(result.startedRunIds).toHaveLength(1);
  });

  it("전부 건너뛰면 배치를 만들지 않는다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const { startAssetsBulkScan } = await import("./bulkScan");
    const { getDb } = await import("@/lib/db");

    const busy = createRepoAsset({ displayName: "busy", repoUrl: "https://github.com/x/busy2" });
    createRun(busy.repoUrl!, "git", busy.id);

    const result = startAssetsBulkScan([busy.id], stubDeps());
    expect(result).toEqual({ batchId: null, startedRunIds: [], skipped: [busy.id] });
    expect(getDb().prepare(`SELECT count(*) as c FROM scan_batches`).get()).toEqual({ c: 0 });
  });

  it("존재하지 않는 자산 id는 무시한다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { startAssetsBulkScan } = await import("./bulkScan");
    const repo = createRepoAsset({ displayName: "r", repoUrl: "https://github.com/x/r" });
    const result = startAssetsBulkScan([repo.id, "no-such-id"], stubDeps());
    expect(result.startedRunIds).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });
});
```

주의: `createServerAsset`의 실제 시그니처는 `src/lib/assets/store.ts`에서 확인해 인자를 맞출 것 (필드명이 다르면 테스트 쪽을 실제 시그니처에 맞춰 조정 — displayName/hostIp/sshPort/authType/username/secret 개념은 동일).

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/bulkScan.test.ts`
Expected: FAIL — bulkScan 모듈 없음

- [ ] **Step 3: 마이그레이션 + createScanBatch nullable + createRepoRun export**

`src/lib/db/index.ts`:
1. 스키마의 `project_id TEXT NOT NULL REFERENCES projects(id)`(scan_batches 블록) → `project_id TEXT REFERENCES projects(id)`.
2. 기존 ALTER 마이그레이션들(try/catch 블록들) 다음에 추가:

```ts
  // scan_batches.project_id를 nullable로 재구축 — 프로젝트와 무관한
  // 자산 선택 일괄 점검(bulk scan)의 배치를 담기 위함. SQLite는 NOT NULL
  // 해제를 지원하지 않아 테이블 재생성으로 마이그레이션한다.
  const scanBatchProjectCol = (
    db.prepare(`PRAGMA table_info(scan_batches)`).all() as { name: string; notnull: number }[]
  ).find((col) => col.name === "project_id");
  if (scanBatchProjectCol && scanBatchProjectCol.notnull === 1) {
    db.exec(`
      CREATE TABLE scan_batches_new (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        created_at TEXT NOT NULL
      );
      INSERT INTO scan_batches_new SELECT id, project_id, created_at FROM scan_batches;
      DROP TABLE scan_batches;
      ALTER TABLE scan_batches_new RENAME TO scan_batches;
    `);
  }
```

`src/lib/pipeline/scanBatches.ts`의 `createScanBatch` 시그니처를 `projectId: string | null`로 변경 (기존 호출자는 전부 string을 넘기므로 무변경 호환):

```ts
export function createScanBatch(projectId: string | null, db: Database = getDb()): { id: string } {
```

`src/lib/pipeline/serverScan.ts`의 `function createRepoRun(` → `export function createRepoRun(` (본문 무변경).

- [ ] **Step 4: bulkScan 구현**

```ts
// src/lib/pipeline/bulkScan.ts
import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getAsset } from "@/lib/assets/store";
import type { Asset } from "@/lib/assets/types";
import { createScanBatch } from "./scanBatches";
import {
  createRepoRun,
  createServerRun,
  repoScanConcurrency,
  runServerScanPipeline,
  runWithConcurrency,
  type ServerScanDeps,
} from "./serverScan";
import { runPipeline } from "./orchestrator";

const BULK_SCAN_CONCURRENCY = 5;

export interface BulkScanResult {
  batchId: string | null; // 시작 가능한 자산이 없으면 null (배치 미생성)
  startedRunIds: string[];
  skipped: string[]; // 이미 실행 중인 점검이 있어 건너뛴 assetId
}

function hasRunningRun(assetId: string, db: Database): boolean {
  return !!db.prepare(`SELECT id FROM runs WHERE asset_id = ? AND status = 'running' LIMIT 1`).get(assetId);
}

// startProjectFleetScan의 자산 선택 버전: 프로젝트 대신 assetIds를 받아 하나의
// 배치로 fire-and-forget 스캔한다. run 행은 동기로 만들어 호출자가 즉시
// 배치 페이지로 이동할 수 있게 한다. 존재하지 않는 id는 무시, 실행 중 점검이
// 있는 자산은 중복 run 방지를 위해 건너뛰고 skipped로 보고한다.
export function startAssetsBulkScan(
  assetIds: string[],
  deps?: ServerScanDeps,
  db: Database = getDb(),
): BulkScanResult {
  const assets = assetIds
    .map((id) => getAsset(id, db))
    .filter((a): a is Asset => a !== undefined);

  const skipped = assets.filter((a) => hasRunningRun(a.id, db)).map((a) => a.id);
  const skippedSet = new Set(skipped);
  const startable = assets.filter((a) => !skippedSet.has(a.id));
  if (startable.length === 0) return { batchId: null, startedRunIds: [], skipped };

  const batch = createScanBatch(null, db);
  const servers = startable.filter((a) => a.type === "server");
  const repos = startable.filter((a) => a.type === "repo");

  const serverCreated = servers.map((asset) => createServerRun(asset.id, batch.id, db));
  const repoCreated = repos.map((asset) => ({ run: createRepoRun(asset, batch.id, db), asset }));

  const serverTasks = serverCreated.map(({ run, asset }) => async () => {
    await runServerScanPipeline(run, asset, deps, db);
  });
  const pipeline = deps?.runPipeline ?? runPipeline;
  const repoTasks = repoCreated.map(({ run, asset }) => async () => {
    await pipeline(
      run.id,
      {
        type: "git",
        repoUrl: asset.repoUrl!,
        ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
      },
      undefined,
      db,
    );
  });
  void Promise.all([
    runWithConcurrency(serverTasks, BULK_SCAN_CONCURRENCY),
    runWithConcurrency(repoTasks, repoScanConcurrency()),
  ]);

  return {
    batchId: batch.id,
    startedRunIds: [...serverCreated.map(({ run }) => run.id), ...repoCreated.map(({ run }) => run.id)],
    skipped,
  };
}
```

주의: `runServerScanPipeline(run, asset, deps, db)`에서 `deps`가 undefined면 함수의 기본값(defaultDeps)이 적용되지 않고 undefined가 전달된다 — serverScan.ts의 시그니처가 `deps: ServerScanDeps = defaultDeps`이므로 **undefined를 넘기면 기본값이 적용된다** (JS 기본 인자 규칙). 그대로 두면 된다.

- [ ] **Step 5: lib 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/bulkScan.test.ts src/lib/pipeline/scanBatches.test.ts`
Expected: bulkScan 4개 PASS, 기존 scanBatches 테스트 회귀 없음

- [ ] **Step 6: 실패하는 라우트 테스트 작성**

```ts
// src/app/api/assets/bulk/scan/route.test.ts
import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 실제 파이프라인이 돌지 않게 스캔 시작부만 스텁
const startAssetsBulkScanMock = vi.fn();
vi.mock("@/lib/pipeline/bulkScan", () => ({
  startAssetsBulkScan: (...args: unknown[]) => startAssetsBulkScanMock(...args),
}));

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
  startAssetsBulkScanMock.mockReset();
});

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets/bulk/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("tester", "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/assets/bulk/scan", () => {
  it("세션 없으면 401", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a"] }));
    expect(res.status).toBe(401);
    expect(startAssetsBulkScanMock).not.toHaveBeenCalled();
  });

  it("빈 assetIds는 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [] }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("배치 시작 시 202 + batchId/started/skipped", async () => {
    startAssetsBulkScanMock.mockReturnValue({
      batchId: "b1", startedRunIds: ["r1", "r2"], skipped: ["a3"],
    });
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a1", "a2", "a3"] }, await authCookie()));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ batchId: "b1", started: 2, skipped: ["a3"] });
  });

  it("전부 건너뛰면 409 (빈 배치 미생성)", async () => {
    startAssetsBulkScanMock.mockReturnValue({ batchId: null, startedRunIds: [], skipped: ["a1"] });
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a1"] }, await authCookie()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.skipped).toEqual(["a1"]);
  });
});
```

- [ ] **Step 7: 라우트 구현**

```ts
// src/app/api/assets/bulk/scan/route.ts
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { startAssetsBulkScan } from "@/lib/pipeline/bulkScan";

// 선택한 자산들로 일괄 점검 배치를 시작한다. run 행은 동기 생성되므로
// 클라이언트는 응답의 batchId로 즉시 배치 페이지로 이동할 수 있다
// (fire-and-forget — 프로젝트 fleet 스캔 라우트와 같은 패턴).
export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const assetIds: string[] = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  if (assetIds.length === 0) {
    return NextResponse.json({ error: "자산을 하나 이상 선택하세요" }, { status: 400 });
  }

  const result = startAssetsBulkScan(assetIds);
  if (result.batchId === null) {
    return NextResponse.json(
      { error: "선택한 자산이 모두 점검 중이거나 존재하지 않습니다", skipped: result.skipped },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { batchId: result.batchId, started: result.startedRunIds.length, skipped: result.skipped },
    { status: 202 },
  );
}
```

- [ ] **Step 8: 전체 게이트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run && npx tsc --noEmit && npx eslint src/lib/pipeline/bulkScan.ts src/app/api/assets/bulk`
Expected: 전체 PASS(+8), tsc·eslint 클린

- [ ] **Step 9: 커밋**

```bash
git add src/lib/db/index.ts src/lib/pipeline/scanBatches.ts src/lib/pipeline/serverScan.ts \
  src/lib/pipeline/bulkScan.ts src/lib/pipeline/bulkScan.test.ts src/app/api/assets/bulk/scan
git commit -m "feat: 자산 선택 일괄 점검 — bulkScan lib·배치 nullable 프로젝트·API (#nhguardian-batch-bulk)"
```

---

### Task 6: 벌크 프로젝트 이동·스케줄·삭제 API

**Files:**
- Modify: `src/lib/assets/store.ts` (`setAssetsProject` 추가)
- Create: `src/app/api/assets/bulk/project/route.ts` + `route.test.ts`
- Create: `src/app/api/assets/bulk/schedule/route.ts` + `route.test.ts`
- Create: `src/app/api/assets/bulk/delete/route.ts` + `route.test.ts`

**Interfaces:**
- Consumes: `deleteAsset`/`AssetInUseError`/`getAsset` (assets store), `upsertSchedule`/`deleteScheduleForAsset` (scheduling store), `getProject`, `requireApiSession`
- Produces:
  - `function setAssetsProject(assetIds: string[], projectId: string | null, db?: Database): number` (변경 행 수)
  - `PATCH /api/assets/bulk/project` `{ assetIds, projectId: string | null }` → 200 `{ updated }` | 400
  - `POST /api/assets/bulk/schedule` `{ assetIds, frequency: "daily"|"weekly"|"monthly"|null }` → 200 `{ updated }` | 400
  - `POST /api/assets/bulk/delete` `{ assetIds }` → 200 `{ deleted, skipped: string[] }` | 400

- [ ] **Step 1: 실패하는 테스트 3파일 작성**

각 테스트 파일은 Task 5 Step 6과 동일한 beforeEach/jsonRequest/authCookie 보일러플레이트를 사용한다 (URL과 메서드만 다름 — mock 없음, 실제 in-memory DB 사용).

```ts
// src/app/api/assets/bulk/project/route.test.ts — describe 본문
describe("PATCH /api/assets/bulk/project", () => {
  it("세션 없으면 401", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(jsonRequest({ assetIds: ["a"], projectId: null }));
    expect(res.status).toBe(401);
  });

  it("빈 assetIds는 400", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(jsonRequest({ assetIds: [], projectId: null }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("존재하지 않는 projectId는 400", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const a = createRepoAsset({ displayName: "r", repoUrl: "https://github.com/x/r" });
    const { PATCH } = await import("./route");
    const res = await PATCH(jsonRequest({ assetIds: [a.id], projectId: "nope" }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("소속을 일괄 변경하고 updated를 반환한다 (null=소속 해제)", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createProject } = await import("@/lib/projects/store");
    const p = createProject({ name: "p", pmName: "pm", pmEmail: "", sharePassword: "pw123456" });
    const a1 = createRepoAsset({ displayName: "r1", repoUrl: "https://github.com/x/r1" });
    const a2 = createRepoAsset({ displayName: "r2", repoUrl: "https://github.com/x/r2" });
    const { PATCH } = await import("./route");

    const res = await PATCH(jsonRequest({ assetIds: [a1.id, a2.id], projectId: p.id }, await authCookie()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });

    const { getAsset } = await import("@/lib/assets/store");
    expect(getAsset(a1.id)?.projectId).toBe(p.id);

    const res2 = await PATCH(jsonRequest({ assetIds: [a1.id], projectId: null }, await authCookie()));
    expect(await res2.json()).toEqual({ updated: 1 });
    expect(getAsset(a1.id)?.projectId).toBeNull();
  });
});
```

```ts
// src/app/api/assets/bulk/schedule/route.test.ts — describe 본문
describe("POST /api/assets/bulk/schedule", () => {
  it("세션 없으면 401", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a"], frequency: "daily" }));
    expect(res.status).toBe(401);
  });

  it("빈 assetIds·잘못된 frequency는 400", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    expect((await POST(jsonRequest({ assetIds: [], frequency: "daily" }, cookie))).status).toBe(400);
    expect((await POST(jsonRequest({ assetIds: ["a"], frequency: "hourly" }, cookie))).status).toBe(400);
  });

  it("frequency를 일괄 적용하고, null이면 스케줄을 해제한다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { getScheduleByAsset } = await import("@/lib/scheduling/store");
    const a1 = createRepoAsset({ displayName: "r1", repoUrl: "https://github.com/x/r1" });
    const a2 = createRepoAsset({ displayName: "r2", repoUrl: "https://github.com/x/r2" });
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(jsonRequest({ assetIds: [a1.id, a2.id], frequency: "weekly" }, cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    expect(getScheduleByAsset(a1.id)?.frequency).toBe("weekly");
    expect(getScheduleByAsset(a1.id)?.enabled).toBe(true);

    const res2 = await POST(jsonRequest({ assetIds: [a1.id], frequency: null }, cookie));
    expect(await res2.json()).toEqual({ updated: 1 });
    expect(getScheduleByAsset(a1.id)).toBeUndefined();
  });

  it("존재하지 않는 자산은 건너뛴다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const a = createRepoAsset({ displayName: "r", repoUrl: "https://github.com/x/r" });
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [a.id, "nope"], frequency: "daily" }, await authCookie()));
    expect(await res.json()).toEqual({ updated: 1 });
  });
});
```

```ts
// src/app/api/assets/bulk/delete/route.test.ts — describe 본문
describe("POST /api/assets/bulk/delete", () => {
  it("세션 없으면 401", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a"] }));
    expect(res.status).toBe(401);
  });

  it("빈 assetIds는 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [] }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("삭제하고, 실행 중 점검이 있는 자산은 skipped로 보고한다", async () => {
    const { createRepoAsset, getAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const busy = createRepoAsset({ displayName: "busy", repoUrl: "https://github.com/x/busy" });
    const idle = createRepoAsset({ displayName: "idle", repoUrl: "https://github.com/x/idle" });
    createRun(busy.repoUrl!, "git", busy.id); // running 상태

    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [busy.id, idle.id, "nope"] }, await authCookie()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1, skipped: [busy.id] });
    expect(getAsset(idle.id)).toBeUndefined();
    expect(getAsset(busy.id)).toBeDefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/app/api/assets/bulk`
Expected: 신규 3파일 전부 FAIL (route 모듈 없음)

- [ ] **Step 3: setAssetsProject + 라우트 3개 구현**

`src/lib/assets/store.ts`에 추가 (listAssets 근처):

```ts
export function setAssetsProject(
  assetIds: string[],
  projectId: string | null,
  db: Database = getDb(),
): number {
  if (assetIds.length === 0) return 0;
  const placeholders = assetIds.map(() => "?").join(",");
  const result = db
    .prepare(`UPDATE assets SET project_id = ? WHERE id IN (${placeholders})`)
    .run(projectId, ...assetIds);
  return result.changes;
}
```

```ts
// src/app/api/assets/bulk/project/route.ts
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { setAssetsProject } from "@/lib/assets/store";
import { getProject } from "@/lib/projects/store";

export async function PATCH(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const assetIds: string[] = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  const projectId: string | null = typeof body?.projectId === "string" ? body.projectId : null;

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "자산을 하나 이상 선택하세요" }, { status: 400 });
  }
  if (projectId !== null && !getProject(projectId)) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다" }, { status: 400 });
  }

  const updated = setAssetsProject(assetIds, projectId);
  return NextResponse.json({ updated });
}
```

```ts
// src/app/api/assets/bulk/schedule/route.ts
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getAsset } from "@/lib/assets/store";
import { deleteScheduleForAsset, upsertSchedule } from "@/lib/scheduling/store";

const FREQUENCIES = ["daily", "weekly", "monthly"] as const;
type Frequency = (typeof FREQUENCIES)[number];

// 선택 자산에 동일한 정기 점검 규칙을 일괄 적용한다. frequency null은 해제.
// 요일/일자는 단순 기본값(월요일/1일, 02:00)을 쓴다 — 세밀한 조정은 자산
// 상세의 기존 스케줄 UI에서 한다.
export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const assetIds: string[] = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  const rawFrequency = body?.frequency ?? null;

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "자산을 하나 이상 선택하세요" }, { status: 400 });
  }
  const isNull = rawFrequency === null;
  if (!isNull && !FREQUENCIES.includes(rawFrequency)) {
    return NextResponse.json({ error: "frequency는 daily/weekly/monthly/null 중 하나여야 합니다" }, { status: 400 });
  }

  let updated = 0;
  for (const assetId of assetIds) {
    if (!getAsset(assetId)) continue;
    if (isNull) {
      deleteScheduleForAsset(assetId);
    } else {
      const frequency = rawFrequency as Frequency;
      upsertSchedule(assetId, {
        frequency,
        dayOfWeek: frequency === "weekly" ? 1 : null,
        dayOfMonth: frequency === "monthly" ? 1 : null,
        timeOfDay: "02:00",
        enabled: true,
      });
    }
    updated++;
  }
  return NextResponse.json({ updated });
}
```

```ts
// src/app/api/assets/bulk/delete/route.ts
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { AssetInUseError, deleteAsset, getAsset } from "@/lib/assets/store";

// 선택 자산 일괄 삭제. 실행 중 점검이 있는 자산(AssetInUseError)은 건너뛰고
// skipped로 보고한다 — 부분 실패를 조용히 삼키지 않는다.
export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const assetIds: string[] = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  if (assetIds.length === 0) {
    return NextResponse.json({ error: "자산을 하나 이상 선택하세요" }, { status: 400 });
  }

  let deleted = 0;
  const skipped: string[] = [];
  for (const assetId of assetIds) {
    if (!getAsset(assetId)) continue;
    try {
      deleteAsset(assetId);
      deleted++;
    } catch (err) {
      if (err instanceof AssetInUseError) {
        skipped.push(assetId);
        continue;
      }
      throw err;
    }
  }
  return NextResponse.json({ deleted, skipped });
}
```

- [ ] **Step 4: 통과 확인 + 게이트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/app/api/assets/bulk && npx tsc --noEmit && npx eslint src/app/api/assets/bulk src/lib/assets/store.ts && npx vitest run 2>&1 | tail -3`
Expected: 신규 11개 포함 전체 PASS, tsc·eslint 클린

- [ ] **Step 5: 커밋**

```bash
git add src/lib/assets/store.ts src/app/api/assets/bulk
git commit -m "feat: 자산 일괄 프로젝트 이동·정기점검 설정·삭제 API (#nhguardian-batch-bulk)"
```

---

### Task 7: 자산 목록 일괄 선택 UI (AssetTable)

**Files:**
- Create: `src/app/assets/AssetTable.tsx` (client)
- Modify: `src/app/assets/page.tsx` (테이블 부분을 AssetTable로 교체 — 데이터 조회·직렬화는 유지)

**Interfaces:**
- Consumes: Task 5·6의 API 4종, `BadgeStatus` 타입
- Produces:
  - `interface AssetRowData { id: string; displayName: string; detail: string; typeLabel: string; projectName: string; createdAt: string; scheduleLabel: string; badgeStatus: BadgeStatus; badgeLabel: string }`
  - `<AssetTable rows={AssetRowData[]} projects={{ id: string; name: string }[]} />`

- [ ] **Step 1: AssetTable 작성**

```tsx
// src/app/assets/AssetTable.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SectionLabel } from "../_components/SectionLabel";
import { StatusBadge } from "../_components/StatusBadge";
import type { BadgeStatus } from "../_components/statusBadgeStyles";

export interface AssetRowData {
  id: string;
  displayName: string;
  detail: string; // repoUrl 또는 host:port
  typeLabel: string; // "레포" | "서버"
  projectName: string;
  createdAt: string;
  scheduleLabel: string;
  badgeStatus: BadgeStatus;
  badgeLabel: string;
}

type PanelMode = null | "move" | "schedule";

const actionButtonClass =
  "rounded-lg border border-primary px-3 py-1.5 text-[13px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50";
const selectClass =
  "rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] focus:border-primary focus:outline-none";

export function AssetTable({
  rows,
  projects,
}: {
  rows: AssetRowData[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<PanelMode>(null);
  const [moveTarget, setMoveTarget] = useState<string>(""); // "" = 소속 없음
  const [scheduleTarget, setScheduleTarget] = useState<string>("daily"); // daily|weekly|monthly|none
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 필터 변경으로 rows가 바뀌면 사라진 행의 선택은 무시한다.
  const rowIds = new Set(rows.map((r) => r.id));
  const selectedIds = [...selected].filter((id) => rowIds.has(id));
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function callBulk(
    path: string,
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: selectedIds, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const handleScan = () =>
    runAction(async () => {
      const { ok, data } = await callBulk("/api/assets/bulk/scan", "POST", {});
      if (!ok) {
        setMessage(String(data.error ?? "일괄 점검 시작 실패"));
        return;
      }
      router.push(`/runs/batch/${data.batchId}`);
    });

  const handleMove = () =>
    runAction(async () => {
      const { ok, data } = await callBulk("/api/assets/bulk/project", "PATCH", {
        projectId: moveTarget === "" ? null : moveTarget,
      });
      setMessage(ok ? `프로젝트 이동 완료 ${data.updated}건` : String(data.error ?? "이동 실패"));
      if (ok) {
        setPanel(null);
        setSelected(new Set());
        router.refresh();
      }
    });

  const handleSchedule = () =>
    runAction(async () => {
      const { ok, data } = await callBulk("/api/assets/bulk/schedule", "POST", {
        frequency: scheduleTarget === "none" ? null : scheduleTarget,
      });
      setMessage(ok ? `정기 점검 설정 완료 ${data.updated}건` : String(data.error ?? "설정 실패"));
      if (ok) {
        setPanel(null);
        setSelected(new Set());
        router.refresh();
      }
    });

  const handleDelete = () =>
    runAction(async () => {
      if (!window.confirm(`선택한 자산 ${selectedIds.length}개를 삭제할까요? 점검 이력도 함께 삭제됩니다.`)) {
        return;
      }
      const { ok, data } = await callBulk("/api/assets/bulk/delete", "POST", {});
      if (!ok) {
        setMessage(String(data.error ?? "삭제 실패"));
        return;
      }
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      setMessage(
        skipped > 0
          ? `삭제 ${data.deleted}건 · 건너뜀 ${skipped}건 (실행 중 점검)`
          : `삭제 완료 ${data.deleted}건`,
      );
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5">
          <span className="text-[13px] font-semibold">{selectedIds.length}개 선택</span>
          <button type="button" disabled={busy} onClick={handleScan} className={actionButtonClass}>
            일괄 점검
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel(panel === "move" ? null : "move")}
            className={actionButtonClass}
          >
            프로젝트 이동
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel(panel === "schedule" ? null : "schedule")}
            className={actionButtonClass}
          >
            정기 점검 설정
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="rounded-lg border border-fail px-3 py-1.5 text-[13px] font-semibold text-fail hover:bg-fail/5 disabled:opacity-50"
          >
            삭제
          </button>

          {panel === "move" && (
            <span className="flex items-center gap-2">
              <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} className={selectClass}>
                <option value="">소속 없음</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={busy} onClick={handleMove} className={actionButtonClass}>
                적용
              </button>
            </span>
          )}
          {panel === "schedule" && (
            <span className="flex items-center gap-2">
              <select
                value={scheduleTarget}
                onChange={(e) => setScheduleTarget(e.target.value)}
                className={selectClass}
              >
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
                <option value="monthly">매월</option>
                <option value="none">해제</option>
              </select>
              <button type="button" disabled={busy} onClick={handleSchedule} className={actionButtonClass}>
                적용
              </button>
            </span>
          )}
        </div>
      )}

      {message && <p className="mb-3 text-[13px] text-muted">{message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-5 py-3">
                <SectionLabel>이름</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>타입</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>프로젝트</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>등록일</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>정기 점검</SectionLabel>
              </th>
              <th className="px-5 py-3">
                <SectionLabel>상태</SectionLabel>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-bg">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`${row.displayName} 선택`}
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                  />
                </td>
                <td className="px-5 py-3">
                  <Link href={`/assets/${row.id}`} className="font-semibold text-primary hover:underline">
                    {row.displayName}
                  </Link>
                  <p className="mt-0.5 font-mono text-[13px] text-muted">{row.detail}</p>
                </td>
                <td className="px-5 py-3 text-muted">{row.typeLabel}</td>
                <td className="px-5 py-3">{row.projectName}</td>
                <td className="px-5 py-3 font-mono text-[13px] text-muted">{row.createdAt}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{row.scheduleLabel}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={row.badgeStatus}>{row.badgeLabel}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="p-5 text-[13px] text-muted italic">조건에 맞는 자산이 없습니다.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: page.tsx에서 테이블 교체**

`src/app/assets/page.tsx`에서 `<Card bodyClassName="p-0">` 내부 전체(기존 `<div className="overflow-x-auto">` ~ 빈 상태 `<p>`)를 다음으로 교체하고, 파일 상단 import에서 `Link`(테이블용) 대신 AssetTable을 추가한다 (`Link`는 상단 버튼들이 계속 쓰므로 유지):

```tsx
        <AssetTable
          rows={assets.map((asset) => {
            const project = projects.find((p) => p.id === asset.projectId);
            const schedule = getScheduleByAsset(asset.id);
            const scheduleLabel =
              !schedule || !schedule.enabled
                ? "—"
                : schedule.frequency === "daily"
                  ? "매일"
                  : schedule.frequency === "weekly"
                    ? "매주"
                    : "매월";
            const badge = ASSET_STATUS_BADGE[statusMap.get(asset.id)?.kind ?? "none"];
            return {
              id: asset.id,
              displayName: asset.displayName,
              detail: asset.type === "repo" ? (asset.repoUrl ?? "") : `${asset.hostIp}:${asset.sshPort}`,
              typeLabel: asset.type === "repo" ? "레포" : "서버",
              projectName: project?.name ?? "미분류",
              createdAt: asset.createdAt,
              scheduleLabel,
              badgeStatus: badge.status,
              badgeLabel: badge.label,
            };
          })}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
```

import 추가: `import { AssetTable } from "./AssetTable";`
기존 테이블 JSX에서만 쓰이던 import(`StatusBadge`, `SectionLabel`)가 미사용이 되면 제거.

- [ ] **Step 3: 게이트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/assets && npx vitest run 2>&1 | tail -3`
Expected: 전부 클린, 전체 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/app/assets/AssetTable.tsx src/app/assets/page.tsx
git commit -m "feat: 자산 목록 일괄 선택·일괄 작업 액션 바 (#nhguardian-batch-bulk)"
```

---

### Task 8: E2E 실서버 점검 검증 세션 (컨트롤러 직접 수행 — 서브에이전트 디스패치 대상 아님)

**Files:** 없음 (스크래치 파일만 — 리포에 커밋하지 않음)

전제: ansible-playbook 2.21·Docker 가동 확인됨. sshpass 없음 → **키 인증만** 사용. 플레이북은 `raw` 태스크만 사용하므로 타깃에 Python 불필요.

- [ ] **Step 1: 임시 키·sshd 컨테이너 3개 기동**

스크래치 디렉터리에서:
```bash
SCRATCH=<scratchpad>/nhg-e2e && mkdir -p "$SCRATCH"
ssh-keygen -t ed25519 -f "$SCRATCH/id_ed25519" -N "" -C "nhg-e2e"
cat > "$SCRATCH/Dockerfile" <<'EOF'
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server && \
    mkdir -p /var/run/sshd /root/.ssh && \
    sed -i 's/#PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
COPY id_ed25519.pub /root/.ssh/authorized_keys
RUN chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D"]
EOF
cp "$SCRATCH/id_ed25519.pub" "$SCRATCH/"
docker build -t nhg-e2e-ssh "$SCRATCH"
for i in 1 2 3; do docker run -d --name "nhg-ssh-$i" -p "222$i:22" nhg-e2e-ssh; done
ssh -i "$SCRATCH/id_ed25519" -o StrictHostKeyChecking=no -p 2221 root@127.0.0.1 'echo OK'
```
Expected: 마지막 ssh가 "OK" 출력.

- [ ] **Step 2: 서버 자산 3개 등록 + 프로젝트 묶기**

유저가 브라우저 UI로 등록하거나, 컨트롤러가 세션 쿠키로 기존 자산 등록 API(`POST /api/assets` — `src/app/api/assets/route.ts`에서 서버 자산 필드 확인)를 호출: host 127.0.0.1, 포트 2221/2222/2223, username root, authType key, secret에 `$SCRATCH/id_ed25519` 개인키 본문. 프로젝트 하나 만들어 3개 모두 소속시킴(또는 `/assets`에서 일괄 프로젝트 이동으로 — Task 6 기능 실검증).

- [ ] **Step 3: 일괄 점검 실행 + 진행 관찰**

`/assets`에서 3개 선택 → "일괄 점검" (Task 5·7 실검증) → `/runs/batch/:id`로 이동해 단계(SSH 연결 → 규칙 평가 → AI 분석)와 진행바가 갱신되는지 관찰 (Task 2·3 실검증). 컨트롤러는 병행으로 sqlite에서 run stage 전이를 폴링해 기록.

- [ ] **Step 4: 결과 검증**

- 배치 3건 모두 종료(성공) 확인, run 리포트에 U-xx/C-xx 체크 결과(pass/fail/review)가 실데이터로 존재.
- 대시보드: 점수·도넛·위험 자산 TOP5·활동 피드에 서버 자산 반영 확인.
- 발견된 결함은 즉시 수정(TDD) 후 재실행.

- [ ] **Step 5: 정리**

```bash
docker rm -f nhg-ssh-1 nhg-ssh-2 nhg-ssh-3 && docker rmi nhg-e2e-ssh
rm -rf "$SCRATCH"
```
테스트 자산·프로젝트는 유저 의사 확인 후 삭제(일괄 삭제 기능 실검증 겸).
