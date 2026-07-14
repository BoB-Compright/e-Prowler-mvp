# PM 공유 뷰 → 관리자 리포트 양식 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PM 공유 뷰를 관리자 점검 리포트(ReportView)와 동일한 읽기 전용 양식(상태 카드·위험요약·필터·전체 항목·AI 근거)으로 렌더한다.

**Architecture:** 관리자 라우트의 인라인 데코레이션을 `getDecoratedResults` 헬퍼로 추출(DRY)해 공유 API가 재사용하고, 공유 API가 자산별 전체 DecoratedCheckResult를 반환한다. 읽기 전용 `ShareReport` 컴포넌트가 공유 프리미티브를 조합해 관리자 레이아웃을 재현하고, ShareGate가 자산 선택 → ShareReport로 통합한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest, Tailwind v4.

## Global Constraints

- 테스트/타입/린트/빌드는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 공유 뷰는 **읽기 전용**: 재점검·보고서 내보내기·실행 상태 보기·CVE 목록 **미포함**.
- 노출: 전체 점검 항목 + evidence + AI 근거(reason) + 조치 가이드(mitigation). **CVE는 비노출.**
- 데코 헬퍼 추출은 순수 리팩터 — 관리자 리포트 동작 불변(동일 shape 반환).
- 기존 디자인 토큰/라벨 어휘를 관리자 ReportView와 동일하게 사용(아래 라벨맵 verbatim).
- 클라이언트 번들 안전: 서버 전용 모듈(@/lib/checks/decorate, @/lib/claude 등)을 클라이언트 컴포넌트에서 값 import 금지. 데코 결과는 서버(API)에서만 만들고 타입만 클라에서 import.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: 데코레이션 헬퍼 추출 + 관리자 라우트 리팩터

**Files:**
- Create: `src/lib/checks/decorate.ts`
- Modify: `src/app/api/runs/[id]/route.ts`
- Test: `src/lib/checks/decorate.test.ts`

**Interfaces:**
- Produces: `getDecoratedResults(runId: string, db?: Database): DecoratedCheckResult[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/checks/decorate.test.ts` 생성. 인메모리 db에 run + check_results를 넣고 데코 결과를 검증한다. 기존
`saveCheckResults`(checks/store)와 `createRun`(pipeline/runs)로 셋업:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { saveCheckResults } from "@/lib/checks/store";
import { getDecoratedResults } from "./decorate";

let db: Database;
beforeEach(() => { db = createInMemoryDb(); });

describe("getDecoratedResults", () => {
  it("check_results를 카탈로그 메타(title/severity/category/framework)로 데코한다", () => {
    const run = createRun("127.0.0.1", "server", null, db);
    saveCheckResults(run.id, [{ id: "U-01", status: "pass", evidence: "PermitRootLogin prohibit-password" }], db);
    const decorated = getDecoratedResults(run.id, db);
    const u01 = decorated.find((d) => d.id === "U-01")!;
    expect(u01.title.length).toBeGreaterThan(0);
    expect(u01.category).toBe("unix");
    expect(u01.severity).toBeTruthy();
    expect(u01.evidence).toContain("PermitRootLogin");
    expect(u01).toHaveProperty("reason"); // 분석 리포트 없으면 null
    expect(u01).toHaveProperty("mitigation");
  });
  it("빈 run은 빈 배열", () => {
    const run = createRun("127.0.0.1", "server", null, db);
    expect(getDecoratedResults(run.id, db)).toEqual([]);
  });
});
```
(확인됨: `saveCheckResults(runId, CheckResult[], db)`, `CheckResult`={id,status,evidence}, `RunSourceType`에 "server" 포함.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/checks/decorate.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 헬퍼 구현 (관리자 라우트의 인라인 로직 그대로 이동)**

`src/lib/checks/decorate.ts` 생성. `src/app/api/runs/[id]/route.ts`의 기존 `const checks: DecoratedCheckResult[] = listCheckResults(id).map(...)` 블록(reportsByItem 포함)을 그대로 옮긴다:

```ts
import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { listCheckResults } from "./store";
import type { DecoratedCheckResult } from "./types";
import { listAnalysisReports } from "@/lib/claude";
import { getCatalogItem, getMitigation } from "@/lib/catalog";

// run의 저장된 점검 결과를 카탈로그 메타·분석 리포트·조치 가이드로 데코한다.
// (관리자 리포트 API와 공유 리포트 API가 공유하는 단일 소스.)
export function getDecoratedResults(runId: string, db: Database = getDb()): DecoratedCheckResult[] {
  const reportsByItem = new Map(
    listAnalysisReports(runId, db).map((report) => [report.itemId, report]),
  );
  return listCheckResults(runId, db).map((result) => {
    const report = reportsByItem.get(result.id);
    const catalogItem = getCatalogItem(result.id);
    return {
      ...result,
      title: catalogItem?.title ?? result.id,
      severity: catalogItem?.severity ?? null,
      category: catalogItem?.category ?? null,
      frameworkId: result.frameworkId ?? catalogItem?.frameworkId ?? null,
      source: result.source,
      sourceRef: catalogItem?.source.ref ?? null,
      reason: report?.reason ?? null,
      remediation: report?.remediation ?? null,
      example: report?.example ?? null,
      mitigation: getMitigation(result.id),
    };
  });
}
```
(확인됨: `listAnalysisReports(runId, db)` — `@/lib/claude`에서 export, db 인자 받음.)

`src/app/api/runs/[id]/route.ts`: 인라인 checks 블록을 삭제하고 헬퍼 호출로 교체:
```ts
import { getDecoratedResults } from "@/lib/checks/decorate";
// ...
  const checks = getDecoratedResults(id);
```
불필요해진 import(listCheckResults, listAnalysisReports, getMitigation, DecoratedCheckResult 등 — 라우트에서 더 안 쓰면) 정리. `getCatalogItem`은 다른 곳에서 쓰면 유지.

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/checks/decorate.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 클린. (관리자 라우트가 동일 shape 반환 — tsc로 확인.)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/checks/decorate.ts src/lib/checks/decorate.test.ts "src/app/api/runs/[id]/route.ts"
git commit -m "refactor: DecoratedCheckResult 데코를 getDecoratedResults로 추출(관리자·공유 공용)"
```

---

### Task 2: 공유 API가 자산별 전체 리포트 반환

**Files:**
- Modify: `src/app/api/share/[token]/route.ts`
- Test: `src/app/api/share/[token]/route.test.ts`

**Interfaces:**
- Consumes: `getDecoratedResults`(Task 1).
- Produces(JSON): `{ project, assets, perAsset: Array<{ assetId: string; run: { id: string; createdAt: string; repoUrl: string } | null; checks: DecoratedCheckResult[] }> }`

- [ ] **Step 1: 실패하는 테스트 작성/수정**

`src/app/api/share/[token]/route.test.ts`의 기존 mitigation 테스트를 확장한다(기존 harness 재사용). 요지:
전체 항목·evidence·reason이 오고, CVE는 안 오고, 미점검 자산은 `run:null, checks:[]`:

```ts
  it("perAsset에 자산별 최신 성공 run의 전체 데코 항목을 반환하고 CVE는 없다", async () => {
    // 기존 테스트가 프로젝트/자산/succeeded run/check_results를 만드는 방식 그대로 셋업.
    // (pass·fail·review·skip 섞인 결과를 저장.)
    const res = await POST(makeReq({ password: "pw" }), ctx(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    const entry = body.perAsset.find((p: any) => p.assetId === assetId);
    expect(entry.run).not.toBeNull();
    expect(entry.checks.length).toBeGreaterThan(0);
    // 전체 상태가 포함(pass도 포함 — 취약/검토만이 아님)
    expect(entry.checks.some((c: any) => c.status === "pass")).toBe(true);
    // 데코 필드
    const any = entry.checks[0];
    expect(any).toHaveProperty("title");
    expect(any).toHaveProperty("evidence");
    expect(any).toHaveProperty("reason");
    // CVE 미노출
    expect(body).not.toHaveProperty("cveMatches");
    expect(entry).not.toHaveProperty("cveMatches");
  });
```
(주: 기존 route.test.ts의 셋업 헬퍼/픽스처 이름·POST 호출 방식을 그대로 따를 것. 기존 findings 기반 단언이 있으면 perAsset 기반으로 갱신.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/share/[token]/route.test.ts"`
Expected: FAIL — perAsset 미구현.

- [ ] **Step 3: 공유 API 수정**

`src/app/api/share/[token]/route.ts`: import에 `getDecoratedResults` 추가(`@/lib/checks/decorate`), 기존
`findings` 블록을 `perAsset`로 교체. `listCheckResults`/`getCatalogItem`/`getMitigation`가 더 안 쓰이면 정리:

```ts
import { getDecoratedResults } from "@/lib/checks/decorate";
// ... (verifyShareAccess·assets·runs·statusMap·publicProject·publicAssets 기존 그대로) ...

  const perAsset = assets.map((asset) => {
    const latest = runs
      .filter((r) => r.assetId === asset.id && r.status === "succeeded")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return { assetId: asset.id, run: null, checks: [] };
    return {
      assetId: asset.id,
      run: { id: latest.id, createdAt: latest.createdAt, repoUrl: latest.repoUrl },
      checks: getDecoratedResults(latest.id),
    };
  });

  return NextResponse.json({ project: publicProject, assets: publicAssets, perAsset });
```
(publicRuns는 ShareGate가 여전히 쓰면 유지, 안 쓰면 제거 — Task 4에서 ShareGate가 perAsset.run을 쓰므로 publicRuns 제거 가능. Task 4와 정합 맞출 것.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/share/[token]/route.test.ts" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/share/[token]/route.ts" "src/app/api/share/[token]/route.test.ts"
git commit -m "feat: 공유 API가 자산별 전체 데코 점검항목 반환(CVE 제외, 읽기 전용 풀리포트용)"
```

---

### Task 3: 읽기 전용 `ShareReport` 컴포넌트

**Files:**
- Create: `src/app/share/[token]/ShareReport.tsx`

**Interfaces:**
- Consumes: `DecoratedCheckResult`(`@/lib/checks/types`), `computeRiskSummary`(`@/lib/checks/riskSummary`), `RiskSummaryBar`, `StatusBadge`, `CountUp`, `SectionLabel`, `Card`, `CHECK_STATUS_LABELS`(`@/lib/catalog/types`), `getFrameworks`(`@/lib/catalog`), 타입 `Category`/`CheckStatus`/`Severity`/`CheckResultSource`.
- Produces: `<ShareReport assetName targetLabel scannedAt checks />`

- [ ] **Step 1: 컴포넌트 구현 (관리자 ReportView의 읽기 전용 재현)**

**참조**: `src/app/runs/[id]/report/ReportView.tsx`를 레이아웃 레퍼런스로 읽고, 아래 읽기 전용 부분만 재현한다.
포함: 상태 카드 4종(Total/Pass/Fail/Review, 클릭=상태필터), `RiskSummaryBar`, 필터 칩(카테고리/상태/프레임워크/AI-only),
항목 리스트(배지·심각도·제목·출처·AI 스파클), 선택 항목 상세(제목·상태·심각도, **AI 분석 근거=reason**,
evidence, 있으면 조치 가이드 risk/fix/example). **제외**: RescanButton, 보고서 내보내기, "실행 상태 보기" 링크,
CveList, `/api/runs` fetch(데이터는 props로 받음).

컴포넌트 뼈대(핵심 로직·라벨맵은 아래 verbatim; 리스트/상세 마크업은 ReportView 스타일 그대로):

```tsx
"use client";

import { useState } from "react";
import type { Category, CheckStatus, Severity } from "@/lib/catalog/types";
import { CHECK_STATUS_LABELS } from "@/lib/catalog/types";
import { getFrameworks } from "@/lib/catalog";
import type { CheckResultSource, DecoratedCheckResult } from "@/lib/checks/types";
import { computeRiskSummary } from "@/lib/checks/riskSummary";
import { RiskSummaryBar } from "@/app/_components/RiskSummaryBar";
import { Card } from "@/app/_components/Card";
import { SectionLabel } from "@/app/_components/SectionLabel";
import { StatusBadge } from "@/app/_components/StatusBadge";
import { CountUp } from "@/app/_components/CountUp";
import type { BadgeStatus } from "@/app/_components/statusBadgeStyles";

const CATEGORY_CHIP_LABELS: Record<Category, string> = {
  container: "컨테이너", unix: "Unix", web: "웹", was: "WAS", db: "DB", windows: "Windows",
};
const CHECK_STATUS_BADGE: Record<CheckStatus, BadgeStatus> = {
  pass: "pass", fail: "fail", review: "review", skip: "neutral", not_automated: "neutral",
};
const SOURCE_LABELS: Record<CheckResultSource, string> = { rule: "룰 기반", ai: "AI 판정" };

function chipStyle(active: boolean): string {
  return `rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap ${
    active ? "border-primary bg-surface font-semibold text-primary" : "border-border text-muted hover:bg-bg"
  }`;
}

export function ShareReport({
  assetName, targetLabel, scannedAt, checks,
}: {
  assetName: string; targetLabel: string; scannedAt: string; checks: DecoratedCheckResult[];
}) {
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CheckStatus | "all">("all");
  const [frameworkFilter, setFrameworkFilter] = useState<string | null>(null);
  const [aiOnly, setAiOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summary = computeRiskSummary(checks);
  const frameworks = getFrameworks();
  const presentFrameworkIds = Array.from(new Set(checks.map((c) => c.frameworkId).filter((x): x is string => !!x)));
  const visibleFrameworks = frameworks.filter((f) => presentFrameworkIds.includes(f.id));
  const filtered = checks.filter(
    (c) =>
      (categoryFilter === "all" || c.category === categoryFilter) &&
      (statusFilter === "all" || c.status === statusFilter) &&
      (!frameworkFilter || c.frameworkId === frameworkFilter) &&
      (!aiOnly || c.source === "ai"),
  );
  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  // ↓ 마크업은 ReportView.tsx의 (a)상태 카드 4개, (b)<RiskSummaryBar summary={summary} />,
  //   (c)필터 칩 행(CATEGORY_CHIP_LABELS/CHECK_STATUS_LABELS/visibleFrameworks/aiOnly),
  //   (d)항목 리스트(filtered.map → StatusBadge[CHECK_STATUS_BADGE]·심각도·제목·SOURCE_LABELS·AI스파클),
  //   (e)선택 상세(selected: 제목·상태배지·심각도, "AI 분석 근거" = selected.reason, evidence,
  //      selected.mitigation 있으면 위험/조치/example)
  //   를 읽기 전용으로 그대로 재현한다. RescanButton·내보내기·실행상태·CveList·헤더의 run 링크는 넣지 않는다.
  //   상단에 assetName·targetLabel·scannedAt(formatKst 대신 이미 문자열이면 그대로)만 표시.
  return ( /* ReportView 본문 참조하여 위 요소 구성 */ );
}
```

- [ ] **Step 2: 정적 검증**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/share/[token]/ShareReport.tsx"`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/share/[token]/ShareReport.tsx"
git commit -m "feat: 읽기 전용 ShareReport(관리자 리포트 양식: 카드·위험요약·필터·항목·AI근거)"
```

---

### Task 4: ShareGate 통합 (자산 선택 → ShareReport)

**Files:**
- Modify: `src/app/share/[token]/ShareGate.tsx`

**Interfaces:**
- Consumes: `ShareReport`(Task 3), 공유 API의 `perAsset`(Task 2).

- [ ] **Step 1: ShareData 타입·상태 갱신**

`src/app/share/[token]/ShareGate.tsx`:
- `ShareData`의 `findings` 필드를 제거하고 `perAsset` 추가(+ import `DecoratedCheckResult` 타입, `ShareReport`):
```ts
import type { DecoratedCheckResult } from "@/lib/checks/types";
import { ShareReport } from "./ShareReport";
// ...
interface ShareData {
  project: { name: string; pmName: string };
  assets: ShareAsset[];
  perAsset: { assetId: string; run: { id: string; createdAt: string; repoUrl: string } | null; checks: DecoratedCheckResult[] }[];
}
```
- 선택 자산 상태 추가: `const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);`
  데이터 로드 성공 후 첫 자산을 기본 선택(예: `setSelectedAssetId(json.assets[0]?.id ?? null)`).

- [ ] **Step 2: 기존 자산표+findings 섹션을 자산 선택 + ShareReport로 교체**

비밀번호 통과 후 렌더 영역에서, 기존 자산 테이블/런/findings 블록을 아래로 교체:
- 자산 선택 UI: `data.assets`를 칩/버튼 목록으로(각 자산명 + `VERDICT_BADGE`), 클릭 시 `setSelectedAssetId`.
  (모바일: 가로 스크롤 `overflow-x-auto` 행.)
- 선택 자산의 `perAsset` 엔트리를 찾아:
  - `entry.run`이 있으면 `<ShareReport assetName={asset.displayName} targetLabel={entry.run.repoUrl} scannedAt={formatKst(entry.run.createdAt)} checks={entry.checks} />`
  - 없으면 "점검 이력이 없습니다" 안내.
- 프로젝트 헤더(`data.project.name`·PM)와 LIVE/설명 문구는 유지.

- [ ] **Step 3: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/share/[token]/ShareGate.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공. (특히 ShareGate가 서버 전용 모듈을 값 import하지 않는지 — 타입만.)

- [ ] **Step 4: 전체 테스트 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run 2>&1 | tail -3`
Expected: 전부 통과.

```bash
git add "src/app/share/[token]/ShareGate.tsx"
git commit -m "feat: PM 공유 뷰를 자산 선택 + 읽기 전용 풀리포트(ShareReport)로 통합"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 공유 링크(비번 입력) → 자산 선택 → 관리자와 동일한 상태 카드·위험요약·필터·전체 항목·AI 근거가 뜨는지.
- 재점검·내보내기·CVE가 공유 뷰에 없는지(읽기 전용).
- 미점검 자산 선택 시 "점검 이력 없음" 안내.
- 관리자 리포트(/runs/[id]/report)가 회귀 없이 그대로인지(데코 헬퍼 추출 영향).
- 모바일 뷰포트에서 자산 선택·리포트·항목 선택·AI 근거 가독.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul) + cloudflared 공개 URL 200(모바일 스타일 정상).
