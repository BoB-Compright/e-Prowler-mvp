# 대시보드 시인성 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자산 수와 무관하게 길이가 고정되는 대시보드 — 종합 보안 점수 게이지, 상태 분포 도넛, 위험 자산 TOP 5, 사이드 활동 피드.

**Architecture:** 계산 로직(점수·분포·정렬·피드 병합)은 전부 `src/lib/dashboard/`의 순수 함수로 분리해 단위 테스트하고, SVG 차트는 외부 라이브러리 없이 지오메트리 헬퍼 + 서버 컴포넌트로 렌더링한다. `src/app/page.tsx`는 데이터 조회·조립만 담당한다.

**Tech Stack:** Next.js App Router(서버 컴포넌트), better-sqlite3 store 함수(기존), vitest, Tailwind v4(@theme 토큰), 순수 SVG.

**Spec:** `docs/superpowers/specs/2026-07-11-dashboard-visibility-design.md`

## Global Constraints

- 테스트/빌드는 Node 24 사용: 모든 명령 앞에 `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` (기본 node 18은 vitest 구동 불가).
- 외부 차트 라이브러리 금지 — SVG 직접 렌더링만.
- 색은 기존 CSS 토큰(`--color-pass/fail/review/neutral/primary`)만 사용, 신규 토큰은 이 계획에서 추가하는 `--color-warn`(주황) 하나뿐.
- dataviz 검증 결과 준수: 도넛은 **범례 텍스트(라벨+건수) 필수, 세그먼트 간 표면 간격(padAngle) 필수, 세그먼트별 `<title>` 툴팁 필수** — 색 단독 식별 금지. 텍스트는 항상 text/muted 토큰(시리즈 색으로 글자 칠하지 않음).
- 도넛 버킷 순서는 고정: pass → review → fail → running → unchecked (건수로 재정렬 금지).
- UI 문구는 한국어, 기존 대시보드 톤 유지 (예: "양호", "취약", "검토", "미점검", "진행 중").
- 커밋 메시지는 기존 컨벤션: `feat|fix|docs: 한국어 요약 (#dashboard-visibility)`.

---

### Task 1: 종합 보안 점수 computeSecurityScore

**Files:**
- Create: `src/lib/dashboard/securityScore.ts`
- Test: `src/lib/dashboard/securityScore.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `type ScoreGrade = "safe" | "caution" | "warning" | "danger"`
  - `interface SecurityScoreInput { totalAssets: number; vulnerableAssets: number; uncheckedAssets: number; criticalHighCheckFindings: number; criticalHighOpenCves: number }`
  - `function computeSecurityScore(input: SecurityScoreInput): { score: number; grade: ScoreGrade }`
  - `function gradeOf(score: number): ScoreGrade`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/dashboard/securityScore.test.ts
import { describe, expect, it } from "vitest";
import { computeSecurityScore, gradeOf } from "./securityScore";

describe("gradeOf", () => {
  it("구간 경계값", () => {
    expect(gradeOf(100)).toBe("safe");
    expect(gradeOf(90)).toBe("safe");
    expect(gradeOf(89)).toBe("caution");
    expect(gradeOf(70)).toBe("caution");
    expect(gradeOf(69)).toBe("warning");
    expect(gradeOf(40)).toBe("warning");
    expect(gradeOf(39)).toBe("danger");
    expect(gradeOf(0)).toBe("danger");
  });
});

describe("computeSecurityScore", () => {
  it("전부 양호면 100점 safe", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 0, uncheckedAssets: 0,
        criticalHighCheckFindings: 0, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 100, grade: "safe" });
  });

  it("감점 상한이 걸려도 0점 밑으로 내려가지 않는다", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 10, uncheckedAssets: 0,
        criticalHighCheckFindings: 100, criticalHighOpenCves: 100,
      }),
    ).toEqual({ score: 0, grade: "danger" });
  });

  it("취약 1/10(-4), C/H 항목 1(-2)이면 94점", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 1, uncheckedAssets: 0,
        criticalHighCheckFindings: 1, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 94, grade: "safe" });
  });

  it("전부 미점검이면 커버리지 감점만 -10 → 90점", () => {
    expect(
      computeSecurityScore({
        totalAssets: 10, vulnerableAssets: 0, uncheckedAssets: 10,
        criticalHighCheckFindings: 0, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 90, grade: "safe" });
  });

  it("복합 감점: 100 -10 -6 -3 -2.5 = 78.5 → 79 caution", () => {
    expect(
      computeSecurityScore({
        totalAssets: 4, vulnerableAssets: 1, uncheckedAssets: 1,
        criticalHighCheckFindings: 3, criticalHighOpenCves: 1,
      }),
    ).toEqual({ score: 79, grade: "caution" });
  });

  it("자산 0개는 방어적으로 100 safe (페이지에서는 빈 상태로 처리)", () => {
    expect(
      computeSecurityScore({
        totalAssets: 0, vulnerableAssets: 0, uncheckedAssets: 0,
        criticalHighCheckFindings: 0, criticalHighOpenCves: 0,
      }),
    ).toEqual({ score: 100, grade: "safe" });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/securityScore.test.ts`
Expected: FAIL — "Cannot find module './securityScore'" 류

- [ ] **Step 3: 구현**

```ts
// src/lib/dashboard/securityScore.ts
export type ScoreGrade = "safe" | "caution" | "warning" | "danger";

export interface SecurityScoreInput {
  totalAssets: number;
  vulnerableAssets: number; // 최근 점검 결과가 "취약"인 자산 수
  uncheckedAssets: number; // 점검 이력이 없는(none) 자산 수
  criticalHighCheckFindings: number; // 최근 점검들의 Critical+High fail 항목 합
  criticalHighOpenCves: number; // 미해제 Critical/High CVE 수
}

export interface SecurityScore {
  score: number; // 0~100 정수
  grade: ScoreGrade;
}

export function gradeOf(score: number): ScoreGrade {
  if (score >= 90) return "safe";
  if (score >= 70) return "caution";
  if (score >= 40) return "warning";
  return "danger";
}

// 산정식은 설계 문서(2026-07-11-dashboard-visibility-design.md) §종합 보안 점수 그대로:
// 100에서 감점 — 취약 자산 비율×40, C/H 점검 항목×2(상한 30), C/H CVE×3(상한 30),
// 미점검 비율×10. 하한 0.
export function computeSecurityScore(input: SecurityScoreInput): SecurityScore {
  if (input.totalAssets <= 0) return { score: 100, grade: "safe" };
  const vulnPenalty = (input.vulnerableAssets / input.totalAssets) * 40;
  const findingPenalty = Math.min(30, input.criticalHighCheckFindings * 2);
  const cvePenalty = Math.min(30, input.criticalHighOpenCves * 3);
  const coveragePenalty = (input.uncheckedAssets / input.totalAssets) * 10;
  const score = Math.max(0, Math.round(100 - vulnPenalty - findingPenalty - cvePenalty - coveragePenalty));
  return { score, grade: gradeOf(score) };
}
```

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/securityScore.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/dashboard/securityScore.ts src/lib/dashboard/securityScore.test.ts
git commit -m "feat: 종합 보안 점수 산정 함수 (#dashboard-visibility)"
```

---

### Task 2: 상태 분포 집계 computeStatusDistribution

**Files:**
- Create: `src/lib/dashboard/statusDistribution.ts`
- Test: `src/lib/dashboard/statusDistribution.test.ts`

**Interfaces:**
- Consumes: `AssetStatusKind` (`@/lib/pipeline/assetStatus` — `"pass" | "fail" | "review" | "error" | "running" | "cancelled" | "none"`)
- Produces:
  - `type DonutBucketKey = "pass" | "review" | "fail" | "running" | "unchecked"`
  - `interface DonutBucket { key: DonutBucketKey; label: string; count: number }`
  - `function computeStatusDistribution(kinds: AssetStatusKind[]): DonutBucket[]` — 항상 5개 버킷을 고정 순서로 반환(0건 포함)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/dashboard/statusDistribution.test.ts
import { describe, expect, it } from "vitest";
import { computeStatusDistribution } from "./statusDistribution";

describe("computeStatusDistribution", () => {
  it("고정 순서 5개 버킷으로 집계한다", () => {
    expect(
      computeStatusDistribution(["pass", "pass", "fail", "review", "running", "none"]),
    ).toEqual([
      { key: "pass", label: "양호", count: 2 },
      { key: "review", label: "검토", count: 1 },
      { key: "fail", label: "취약", count: 1 },
      { key: "running", label: "진행 중", count: 1 },
      { key: "unchecked", label: "미점검", count: 1 },
    ]);
  });

  it("error/cancelled는 미점검으로 묶인다", () => {
    const buckets = computeStatusDistribution(["error", "cancelled", "none"]);
    expect(buckets.find((b) => b.key === "unchecked")?.count).toBe(3);
  });

  it("빈 입력이면 전부 0건", () => {
    expect(computeStatusDistribution([]).every((b) => b.count === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/statusDistribution.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// src/lib/dashboard/statusDistribution.ts
import type { AssetStatusKind } from "@/lib/pipeline/assetStatus";

export type DonutBucketKey = "pass" | "review" | "fail" | "running" | "unchecked";

export interface DonutBucket {
  key: DonutBucketKey;
  label: string;
  count: number;
}

// 도넛 버킷 순서는 고정 (dataviz: 순위에 따라 색/순서를 바꾸지 않는다)
const BUCKET_ORDER: { key: DonutBucketKey; label: string }[] = [
  { key: "pass", label: "양호" },
  { key: "review", label: "검토" },
  { key: "fail", label: "취약" },
  { key: "running", label: "진행 중" },
  { key: "unchecked", label: "미점검" },
];

// error(실행 실패)/cancelled(취소)는 "점검 결과가 없는 상태"이므로 보안 상태
// 분포에서는 미점검으로 묶는다. 개별 실패는 활동 피드와 자산 페이지에서 드러난다.
function bucketOf(kind: AssetStatusKind): DonutBucketKey {
  if (kind === "pass" || kind === "review" || kind === "fail" || kind === "running") return kind;
  return "unchecked";
}

export function computeStatusDistribution(kinds: AssetStatusKind[]): DonutBucket[] {
  const counts: Record<DonutBucketKey, number> = { pass: 0, review: 0, fail: 0, running: 0, unchecked: 0 };
  for (const kind of kinds) counts[bucketOf(kind)] += 1;
  return BUCKET_ORDER.map(({ key, label }) => ({ key, label, count: counts[key] }));
}
```

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/statusDistribution.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/dashboard/statusDistribution.ts src/lib/dashboard/statusDistribution.test.ts
git commit -m "feat: 자산 상태 분포 집계 함수 (#dashboard-visibility)"
```

---

### Task 3: 위험 자산 정렬 rankRiskyAssets

**Files:**
- Create: `src/lib/dashboard/riskyAssets.ts`
- Test: `src/lib/dashboard/riskyAssets.test.ts`

**Interfaces:**
- Consumes: `AssetStatusKind` (`@/lib/pipeline/assetStatus`)
- Produces:
  - `interface RiskyAssetRow { assetId: string; displayName: string; assetType: "repo" | "server"; statusKind: AssetStatusKind; criticalHigh: number; openCveCount: number }`
  - `function rankRiskyAssets(rows: RiskyAssetRow[], limit?: number): RiskyAssetRow[]` (기본 limit 5)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/dashboard/riskyAssets.test.ts
import { describe, expect, it } from "vitest";
import { rankRiskyAssets, type RiskyAssetRow } from "./riskyAssets";

function row(partial: Partial<RiskyAssetRow> & { assetId: string }): RiskyAssetRow {
  return {
    displayName: partial.assetId,
    assetType: "repo",
    statusKind: "pass",
    criticalHigh: 0,
    openCveCount: 0,
    ...partial,
  };
}

describe("rankRiskyAssets", () => {
  it("상태 우선순위: 취약 > 검토 > 실패 > 미점검 > 취소 > 진행 중 > 양호", () => {
    const ranked = rankRiskyAssets([
      row({ assetId: "a-pass", statusKind: "pass" }),
      row({ assetId: "a-fail", statusKind: "fail" }),
      row({ assetId: "a-none", statusKind: "none" }),
      row({ assetId: "a-review", statusKind: "review" }),
      row({ assetId: "a-error", statusKind: "error" }),
    ]);
    expect(ranked.map((r) => r.assetId)).toEqual([
      "a-fail", "a-review", "a-error", "a-none", "a-pass",
    ]);
  });

  it("동순위면 C/H 항목 수 → CVE 수 내림차순", () => {
    const ranked = rankRiskyAssets([
      row({ assetId: "x", statusKind: "fail", criticalHigh: 1, openCveCount: 9 }),
      row({ assetId: "y", statusKind: "fail", criticalHigh: 5, openCveCount: 0 }),
      row({ assetId: "z", statusKind: "fail", criticalHigh: 1, openCveCount: 20 }),
    ]);
    expect(ranked.map((r) => r.assetId)).toEqual(["y", "z", "x"]);
  });

  it("limit 만큼 자른다 (기본 5)", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ assetId: `a${i}` }));
    expect(rankRiskyAssets(rows)).toHaveLength(5);
    expect(rankRiskyAssets(rows, 3)).toHaveLength(3);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const rows = [row({ assetId: "b", statusKind: "pass" }), row({ assetId: "a", statusKind: "fail" })];
    rankRiskyAssets(rows);
    expect(rows[0].assetId).toBe("b");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/riskyAssets.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// src/lib/dashboard/riskyAssets.ts
import type { AssetStatusKind } from "@/lib/pipeline/assetStatus";

export interface RiskyAssetRow {
  assetId: string;
  displayName: string;
  assetType: "repo" | "server";
  statusKind: AssetStatusKind;
  criticalHigh: number; // 최근 점검의 Critical+High fail 항목 수
  openCveCount: number; // 미해제 CVE 수 (repo 자산은 0)
}

// 낮을수록 위험. 실패(error)는 결과를 모르니 미점검보다 위로 둔다.
const STATUS_RANK: Record<AssetStatusKind, number> = {
  fail: 0, review: 1, error: 2, none: 3, cancelled: 4, running: 5, pass: 6,
};

export function rankRiskyAssets(rows: RiskyAssetRow[], limit = 5): RiskyAssetRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        STATUS_RANK[a.statusKind] - STATUS_RANK[b.statusKind] ||
        b.criticalHigh - a.criticalHigh ||
        b.openCveCount - a.openCveCount ||
        a.displayName.localeCompare(b.displayName, "ko"),
    )
    .slice(0, limit);
}
```

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/riskyAssets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/dashboard/riskyAssets.ts src/lib/dashboard/riskyAssets.test.ts
git commit -m "feat: 위험 자산 TOP-N 정렬 함수 (#dashboard-visibility)"
```

---

### Task 4: 활동 피드 buildActivityFeed + formatRelativeTime

**Files:**
- Create: `src/lib/dashboard/activityFeed.ts`
- Test: `src/lib/dashboard/activityFeed.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수 — DB 접근은 페이지가 담당)
- Produces:
  - `interface RunFeedInput { runId: string; assetName: string; status: "running" | "succeeded" | "failed" | "cancelled"; failCount: number | null; reviewCount: number | null; at: string }`
  - `interface AssetFeedInput { assetId: string; assetName: string; at: string }`
  - `interface ActivityEvent { key: string; href: string; title: string; detail: string; tone: "pass" | "fail" | "review" | "progress" | "neutral"; at: string }` — `tone`은 `statusBadgeStyles`의 `BadgeStatus` 값과 호환
  - `function buildActivityFeed(runs: RunFeedInput[], assets: AssetFeedInput[], limit?: number): ActivityEvent[]` (기본 limit 10, 시간 역순)
  - `function formatRelativeTime(iso: string, now: Date): string`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/dashboard/activityFeed.test.ts
import { describe, expect, it } from "vitest";
import { buildActivityFeed, formatRelativeTime } from "./activityFeed";

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-11T12:00:00.000Z");
  it("1분 미만은 '방금 전'", () => {
    expect(formatRelativeTime("2026-07-11T11:59:30.000Z", now)).toBe("방금 전");
  });
  it("1시간 미만은 N분 전", () => {
    expect(formatRelativeTime("2026-07-11T11:55:00.000Z", now)).toBe("5분 전");
  });
  it("24시간 미만은 N시간 전", () => {
    expect(formatRelativeTime("2026-07-11T09:00:00.000Z", now)).toBe("3시간 전");
  });
  it("24시간 이상은 MM-DD HH:mm", () => {
    expect(formatRelativeTime("2026-07-09T09:30:00.000Z", now)).toBe("07-09 09:30");
  });
});

describe("buildActivityFeed", () => {
  it("run과 자산 등록을 시간 역순으로 병합하고 limit으로 자른다", () => {
    const events = buildActivityFeed(
      [
        { runId: "r1", assetName: "server-a", status: "succeeded", failCount: 3, reviewCount: 1, at: "2026-07-11T10:00:00.000Z" },
        { runId: "r2", assetName: "repo-b", status: "running", failCount: null, reviewCount: null, at: "2026-07-11T11:00:00.000Z" },
      ],
      [{ assetId: "a1", assetName: "repo-c", at: "2026-07-11T10:30:00.000Z" }],
      2,
    );
    expect(events.map((e) => e.key)).toEqual(["run-r2", "asset-a1"]);
  });

  it("완료 run은 결과 요약과 tone을 담는다", () => {
    const [vuln] = buildActivityFeed(
      [{ runId: "r1", assetName: "s", status: "succeeded", failCount: 3, reviewCount: 1, at: "2026-07-11T10:00:00.000Z" }],
      [],
    );
    expect(vuln).toMatchObject({ href: "/runs/r1/report", detail: "점검 완료 — 취약 3건 · 검토 1건", tone: "fail" });

    const [clean] = buildActivityFeed(
      [{ runId: "r2", assetName: "s", status: "succeeded", failCount: 0, reviewCount: 0, at: "2026-07-11T10:00:00.000Z" }],
      [],
    );
    expect(clean).toMatchObject({ detail: "점검 완료 — 양호", tone: "pass" });

    const [review] = buildActivityFeed(
      [{ runId: "r3", assetName: "s", status: "succeeded", failCount: 0, reviewCount: 2, at: "2026-07-11T10:00:00.000Z" }],
      [],
    );
    expect(review).toMatchObject({ detail: "점검 완료 — 검토 2건", tone: "review" });
  });

  it("진행/실패/취소/자산 등록 이벤트의 tone·링크", () => {
    const events = buildActivityFeed(
      [
        { runId: "r1", assetName: "s", status: "running", failCount: null, reviewCount: null, at: "2026-07-11T04:00:00.000Z" },
        { runId: "r2", assetName: "s", status: "failed", failCount: null, reviewCount: null, at: "2026-07-11T03:00:00.000Z" },
        { runId: "r3", assetName: "s", status: "cancelled", failCount: null, reviewCount: null, at: "2026-07-11T02:00:00.000Z" },
      ],
      [{ assetId: "a1", assetName: "new-asset", at: "2026-07-11T01:00:00.000Z" }],
    );
    expect(events[0]).toMatchObject({ href: "/runs/r1", detail: "점검 진행 중", tone: "progress" });
    expect(events[1]).toMatchObject({ href: "/runs/r2/report", detail: "점검 실패", tone: "fail" });
    expect(events[2]).toMatchObject({ href: "/runs/r3/report", detail: "점검 취소됨", tone: "neutral" });
    expect(events[3]).toMatchObject({ href: "/assets/a1", detail: "자산 등록", tone: "neutral" });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/activityFeed.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// src/lib/dashboard/activityFeed.ts
export interface RunFeedInput {
  runId: string;
  assetName: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  failCount: number | null; // succeeded run의 취약(fail) 점검 항목 수
  reviewCount: number | null;
  at: string; // ISO (run.updatedAt)
}

export interface AssetFeedInput {
  assetId: string;
  assetName: string;
  at: string; // ISO (asset.createdAt)
}

// tone 값은 statusBadgeStyles의 BadgeStatus와 호환된다 — 페이지에서 그대로 색 매핑.
export interface ActivityEvent {
  key: string;
  href: string;
  title: string; // 자산명
  detail: string;
  tone: "pass" | "fail" | "review" | "progress" | "neutral";
  at: string;
}

function runEvent(run: RunFeedInput): ActivityEvent {
  const base = { key: `run-${run.runId}`, title: run.assetName, at: run.at };
  if (run.status === "running") {
    return { ...base, href: `/runs/${run.runId}`, detail: "점검 진행 중", tone: "progress" };
  }
  if (run.status === "failed") {
    return { ...base, href: `/runs/${run.runId}/report`, detail: "점검 실패", tone: "fail" };
  }
  if (run.status === "cancelled") {
    return { ...base, href: `/runs/${run.runId}/report`, detail: "점검 취소됨", tone: "neutral" };
  }
  const fail = run.failCount ?? 0;
  const review = run.reviewCount ?? 0;
  const summary = fail > 0 ? `취약 ${fail}건 · 검토 ${review}건` : review > 0 ? `검토 ${review}건` : "양호";
  const tone = fail > 0 ? ("fail" as const) : review > 0 ? ("review" as const) : ("pass" as const);
  return { ...base, href: `/runs/${run.runId}/report`, detail: `점검 완료 — ${summary}`, tone };
}

export function buildActivityFeed(
  runs: RunFeedInput[],
  assets: AssetFeedInput[],
  limit = 10,
): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...runs.map(runEvent),
    ...assets.map((a) => ({
      key: `asset-${a.assetId}`,
      href: `/assets/${a.assetId}`,
      title: a.assetName,
      detail: "자산 등록",
      tone: "neutral" as const,
      at: a.at,
    })),
  ];
  // ISO 8601은 문자열 비교가 시간 비교와 일치한다
  return events.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

export function formatRelativeTime(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 60_000) return "방금 전";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return iso.replace("T", " ").slice(5, 16); // "MM-DD HH:mm"
}
```

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/activityFeed.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/dashboard/activityFeed.ts src/lib/dashboard/activityFeed.test.ts
git commit -m "feat: 대시보드 활동 피드 병합·상대시간 함수 (#dashboard-visibility)"
```

---

### Task 5: SVG 지오메트리 + 게이지·도넛 컴포넌트 + --color-warn 토큰

**Files:**
- Create: `src/lib/dashboard/donutGeometry.ts`
- Test: `src/lib/dashboard/donutGeometry.test.ts`
- Create: `src/app/_components/dashboard/SecurityScoreGauge.tsx`
- Create: `src/app/_components/dashboard/AssetStatusDonut.tsx`
- Modify: `src/app/globals.css` (`:root`, `[data-theme="dark"]`, `@theme inline` 세 블록)

**Interfaces:**
- Consumes: `ScoreGrade` (Task 1), `DonutBucket` (Task 2)
- Produces:
  - `function donutSegmentPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string` — 각도는 라디안, 0 = 12시 방향, 시계 방향 증가
  - `function gaugeArcPath(cx: number, cy: number, r: number, start: number, end: number): string`
  - `function computeDonutArcs(slices: { key: string; value: number }[], opts: { cx: number; cy: number; rOuter: number; rInner: number; padAngle?: number }): { key: string; d: string }[]`
  - `<SecurityScoreGauge score={number} grade={ScoreGrade} />`
  - `<AssetStatusDonut buckets={DonutBucket[]} total={number} />`
  - CSS 토큰 `--color-warn` (Tailwind 유틸 `text-warn` 등 사용 가능)

- [ ] **Step 1: 지오메트리 실패 테스트 작성**

```ts
// src/lib/dashboard/donutGeometry.test.ts
import { describe, expect, it } from "vitest";
import { computeDonutArcs, donutSegmentPath, gaugeArcPath } from "./donutGeometry";

describe("donutSegmentPath", () => {
  it("링 세그먼트 path: M → 외곽 A → L → 내곽 A → Z", () => {
    const d = donutSegmentPath(80, 80, 76, 52, 0, Math.PI / 2);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.match(/A /g)).toHaveLength(2);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("gaugeArcPath", () => {
  it("스트로크용 아크 path: M → A, 닫지 않음", () => {
    const d = gaugeArcPath(100, 100, 80, -2, 2);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("A ");
    expect(d.endsWith("Z")).toBe(false);
  });
});

describe("computeDonutArcs", () => {
  const opts = { cx: 80, cy: 80, rOuter: 76, rInner: 52 };

  it("0건 슬라이스는 건너뛴다", () => {
    const arcs = computeDonutArcs(
      [{ key: "a", value: 2 }, { key: "b", value: 0 }, { key: "c", value: 1 }],
      opts,
    );
    expect(arcs.map((a) => a.key)).toEqual(["a", "c"]);
  });

  it("전체가 0이면 빈 배열", () => {
    expect(computeDonutArcs([{ key: "a", value: 0 }], opts)).toEqual([]);
  });

  it("단일 100% 슬라이스도 퇴화하지 않은 path를 만든다", () => {
    const arcs = computeDonutArcs([{ key: "only", value: 5 }], opts);
    expect(arcs).toHaveLength(1);
    // 시작점과 끝점이 같으면 arc가 사라진다 — 끝각을 TAU 직전으로 클램프했는지 확인
    const [, mx] = arcs[0].d.match(/^M ([\d.-]+) /)!;
    const after = arcs[0].d.split("A ")[1];
    expect(after).toBeDefined();
    expect(Number(mx)).not.toBeNaN();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/donutGeometry.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 지오메트리 구현**

```ts
// src/lib/dashboard/donutGeometry.ts
// SVG 좌표계: 각도 0 = 12시 방향, 시계 방향으로 증가 (라디안).
const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

// 도넛 링 세그먼트(fill용): 외곽 아크 → 내곽 아크 역방향으로 닫는다.
export function donutSegmentPath(
  cx: number, cy: number, rOuter: number, rInner: number,
  start: number, end: number,
): string {
  const [x0, y0] = polar(cx, cy, rOuter, start);
  const [x1, y1] = polar(cx, cy, rOuter, end);
  const [x2, y2] = polar(cx, cy, rInner, end);
  const [x3, y3] = polar(cx, cy, rInner, start);
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${x0} ${y0}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3}`,
    "Z",
  ].join(" ");
}

// 게이지(stroke용) 아크 — strokeLinecap="round"와 함께 쓴다.
export function gaugeArcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x0, y0] = polar(cx, cy, r, start);
  const [x1, y1] = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export interface DonutArcOptions {
  cx: number;
  cy: number;
  rOuter: number;
  rInner: number;
  padAngle?: number; // 세그먼트 사이 표면 간격(라디안). 기본 0.04 ≈ 반경 76px에서 ~3px
}

export function computeDonutArcs(
  slices: { key: string; value: number }[],
  { cx, cy, rOuter, rInner, padAngle = 0.04 }: DonutArcOptions,
): { key: string; d: string }[] {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];
  const nonzeroCount = slices.filter((s) => s.value > 0).length;
  const pad = nonzeroCount > 1 ? padAngle : 0; // 단일 세그먼트엔 간격 불필요

  let cursor = 0;
  const arcs: { key: string; d: string }[] = [];
  for (const slice of slices) {
    if (slice.value <= 0) continue;
    const sweep = (slice.value / total) * TAU;
    const start = cursor + pad / 2;
    // 100% 단일 세그먼트에서 시작점==끝점이 되면 아크가 사라지므로 TAU 직전으로 클램프
    const end = Math.min(cursor + sweep - pad / 2, start + TAU - 0.001);
    if (end > start) arcs.push({ key: slice.key, d: donutSegmentPath(cx, cy, rOuter, rInner, start, end) });
    cursor += sweep;
  }
  return arcs;
}
```

- [ ] **Step 4: 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/dashboard/donutGeometry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: --color-warn 토큰 추가**

`src/app/globals.css` 세 곳 수정:

`:root` 블록의 `--color-neutral` 줄 다음에 추가:

```css
  --color-warn: #e8590c; /* 경고(주황) — 종합 보안 점수 40~69 구간 */
```

`[data-theme="dark"]` 블록의 `--color-muted` 줄 다음에 추가:

```css
  --color-warn: #ff8a3d; /* 어두운 서페이스용 밝은 주황 */
```

`@theme inline` 블록의 `--color-neutral: var(--color-neutral);` 줄 다음에 추가:

```css
  --color-warn: var(--color-warn);
```

- [ ] **Step 6: 게이지 컴포넌트 작성**

```tsx
// src/app/_components/dashboard/SecurityScoreGauge.tsx
import { gaugeArcPath } from "@/lib/dashboard/donutGeometry";
import type { ScoreGrade } from "@/lib/dashboard/securityScore";

const TAU = Math.PI * 2;
const START = -TAU / 3; // -120° (7시 방향)
const SWEEP = (TAU * 2) / 3; // 240° 스윕

// 점수 텍스트는 text 토큰, 상태색은 아크와 칩에만 (dataviz: 텍스트에 시리즈색 금지)
const GRADE_META: Record<ScoreGrade, { label: string; color: string }> = {
  safe: { label: "안전", color: "var(--color-pass)" },
  caution: { label: "주의", color: "var(--color-review)" },
  warning: { label: "경고", color: "var(--color-warn)" },
  danger: { label: "위험", color: "var(--color-fail)" },
};

export function SecurityScoreGauge({ score, grade }: { score: number; grade: ScoreGrade }) {
  const meta = GRADE_META[grade];
  const fraction = Math.max(0, Math.min(1, score / 100));
  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 200 150"
        className="w-full max-w-[220px]"
        role="img"
        aria-label={`종합 보안 점수 ${score}점 (100점 만점), ${meta.label}`}
      >
        <path
          d={gaugeArcPath(100, 90, 78, START, START + SWEEP)}
          fill="none" stroke="var(--color-border)" strokeWidth={14} strokeLinecap="round"
        />
        {fraction > 0 && (
          <path
            d={gaugeArcPath(100, 90, 78, START, START + SWEEP * fraction)}
            fill="none" stroke={meta.color} strokeWidth={14} strokeLinecap="round"
          />
        )}
        <text x={100} y={92} textAnchor="middle" className="fill-text" fontSize={40} fontWeight={700}>
          {score}
        </text>
        <text x={100} y={114} textAnchor="middle" className="fill-muted" fontSize={13}>
          /100
        </text>
      </svg>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </span>
    </div>
  );
}
```

- [ ] **Step 7: 도넛 컴포넌트 작성**

```tsx
// src/app/_components/dashboard/AssetStatusDonut.tsx
import { computeDonutArcs } from "@/lib/dashboard/donutGeometry";
import type { DonutBucket, DonutBucketKey } from "@/lib/dashboard/statusDistribution";

// 상태색은 기존 시맨틱 토큰 재사용. 식별은 색 단독이 아니라
// 범례 텍스트(라벨+건수)와 세그먼트 <title> 툴팁이 함께 담당한다 (dataviz).
const BUCKET_COLOR: Record<DonutBucketKey, string> = {
  pass: "var(--color-pass)",
  review: "var(--color-review)",
  fail: "var(--color-fail)",
  running: "var(--color-primary)",
  unchecked: "var(--color-neutral)",
};

export function AssetStatusDonut({ buckets, total }: { buckets: DonutBucket[]; total: number }) {
  const arcs = computeDonutArcs(
    buckets.map((b) => ({ key: b.key, value: b.count })),
    { cx: 80, cy: 80, rOuter: 76, rInner: 52 },
  );
  const bucketByKey = new Map(buckets.map((b) => [b.key, b]));
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-[140px] w-[140px] shrink-0" role="img" aria-label="자산 상태 분포">
        {arcs.map((arc) => {
          const bucket = bucketByKey.get(arc.key as DonutBucketKey)!;
          return (
            <path key={arc.key} d={arc.d} fill={BUCKET_COLOR[bucket.key]}>
              <title>{`${bucket.label} ${bucket.count}개`}</title>
            </path>
          );
        })}
        <text x={80} y={78} textAnchor="middle" className="fill-text" fontSize={28} fontWeight={700}>
          {total}
        </text>
        <text x={80} y={98} textAnchor="middle" className="fill-muted" fontSize={12}>
          자산
        </text>
      </svg>
      <ul className="flex min-w-[120px] flex-1 flex-col gap-1.5 text-[13px]">
        {buckets.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: BUCKET_COLOR[b.key] }} />
            <span>{b.label}</span>
            <span className="ml-auto font-mono font-semibold">{b.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8: 타입·린트 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/lib/dashboard src/app/_components/dashboard`
Expected: 출력 없음 (성공)

- [ ] **Step 9: 커밋**

```bash
git add src/lib/dashboard/donutGeometry.ts src/lib/dashboard/donutGeometry.test.ts \
  src/app/_components/dashboard src/app/globals.css
git commit -m "feat: 보안 점수 게이지·상태 분포 도넛 SVG 컴포넌트 (#dashboard-visibility)"
```

---

### Task 6: 대시보드 페이지 재구성 (2단 레이아웃)

**Files:**
- Create: `src/app/_components/AutoRefresh.tsx` (기존 `src/app/projects/[id]/AutoRefresh.tsx`를 이동)
- Delete: `src/app/projects/[id]/AutoRefresh.tsx`
- Modify: `src/app/projects/[id]/page.tsx` (AutoRefresh import 경로만)
- Create: `src/app/_components/dashboard/ActivityFeedCard.tsx`
- Modify: `src/app/page.tsx` (전면 교체)

**Interfaces:**
- Consumes: Task 1~5의 모든 산출물, 기존 store 함수들(`listAssets`, `listRuns`, `getAssetStatusMap`, `getRunRiskSummary`, `listCveMatches`, `getScheduleByAsset`, `getRepoDisplayName`), 기존 컴포넌트(`Card`, `SectionLabel`, `StatusBadge`, `ASSET_STATUS_BADGE`)
- Produces: 새 대시보드 페이지

- [ ] **Step 1: AutoRefresh를 공용 컴포넌트로 이동**

```bash
git mv "src/app/projects/[id]/AutoRefresh.tsx" src/app/_components/AutoRefresh.tsx
grep -rn "AutoRefresh" src/ --include="*.tsx" --include="*.ts" -l
```

grep에 나온 모든 파일(현재 기준 `src/app/projects/[id]/page.tsx`)의 import를 수정:

```tsx
// src/app/projects/[id]/page.tsx — 기존
import { AutoRefresh } from "./AutoRefresh";
// 변경
import { AutoRefresh } from "../../_components/AutoRefresh";
```

- [ ] **Step 2: 활동 피드 카드 컴포넌트 작성**

```tsx
// src/app/_components/dashboard/ActivityFeedCard.tsx
import Link from "next/link";
import { Card } from "../Card";
import { formatRelativeTime, type ActivityEvent } from "@/lib/dashboard/activityFeed";

const TONE_COLOR: Record<ActivityEvent["tone"], string> = {
  pass: "var(--color-pass)",
  fail: "var(--color-fail)",
  review: "var(--color-review)",
  progress: "var(--color-primary)",
  neutral: "var(--color-neutral)",
};

export function ActivityFeedCard({ events, now }: { events: ActivityEvent[]; now: Date }) {
  return (
    <Card title="최근 활동" bodyClassName="p-0">
      {events.length === 0 ? (
        <p className="p-5 text-[13px] text-muted italic">아직 활동이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((ev) => (
            <li key={ev.key}>
              <Link href={ev.href} className="flex gap-3 px-5 py-3 text-sm hover:bg-bg">
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TONE_COLOR[ev.tone] }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{ev.title}</span>
                    <span className="ml-auto whitespace-nowrap font-mono text-[12px] text-muted">
                      {formatRelativeTime(ev.at, now)}
                    </span>
                  </span>
                  <span className="text-[13px] text-muted">{ev.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: page.tsx 전면 교체**

```tsx
// src/app/page.tsx
import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { listCveMatches } from "@/lib/cve/store";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { getRunRiskSummary } from "@/lib/checks/riskSummaryStore";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";
import { getRepoDisplayName } from "@/lib/pipeline/repoUrl";
import { computeSecurityScore } from "@/lib/dashboard/securityScore";
import { computeStatusDistribution } from "@/lib/dashboard/statusDistribution";
import { rankRiskyAssets } from "@/lib/dashboard/riskyAssets";
import { buildActivityFeed } from "@/lib/dashboard/activityFeed";
import type { Run } from "@/lib/pipeline/types";
import { LocalImageFallbackForm } from "./LocalImageFallbackForm";
import { AutoRefresh } from "./_components/AutoRefresh";
import { Card } from "./_components/Card";
import { SectionLabel } from "./_components/SectionLabel";
import { StatusBadge } from "./_components/StatusBadge";
import { ASSET_STATUS_BADGE } from "./_components/assetStatusBadge";
import { SecurityScoreGauge } from "./_components/dashboard/SecurityScoreGauge";
import { AssetStatusDonut } from "./_components/dashboard/AssetStatusDonut";
import { ActivityFeedCard } from "./_components/dashboard/ActivityFeedCard";

export default function DashboardPage() {
  const assets = listAssets();
  const allRuns = listRuns(); // 최신순 정렬 보장 (created_at DESC)
  const statusMap = getAssetStatusMap();
  const runById = new Map<string, Run>(allRuns.map((run) => [run.id, run]));

  const rows = assets.map((asset) => {
    const status = statusMap.get(asset.id) ?? { kind: "none" as const };
    const lastRun = status.runId ? runById.get(status.runId) : undefined;
    const summary = lastRun && lastRun.status !== "running" ? getRunRiskSummary(lastRun.id) : null;
    const schedule = getScheduleByAsset(asset.id);
    const openCveCount =
      asset.type === "server"
        ? listCveMatches(asset.id).filter((m) => !m.dismissed).length
        : 0;
    return { asset, status, summary, schedule, openCveCount };
  });

  // KPI (기존 유지)
  const repoCount = assets.filter((a) => a.type === "repo").length;
  const serverCount = assets.length - repoCount;
  const vulnerableCount = rows.filter((row) => row.status.kind === "fail").length;
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

  // 종합 점수 · 분포 · TOP 5
  const criticalHigh = (summary: { severityCounts: Record<string, number> } | null) =>
    summary ? summary.severityCounts.Critical + summary.severityCounts.High : 0;
  const { score, grade } = computeSecurityScore({
    totalAssets: assets.length,
    vulnerableAssets: vulnerableCount,
    uncheckedAssets: rows.filter((row) => row.status.kind === "none").length,
    criticalHighCheckFindings: rows.reduce((sum, row) => sum + criticalHigh(row.summary), 0),
    criticalHighOpenCves: criticalHighCves.length,
  });
  const distribution = computeStatusDistribution(rows.map((row) => row.status.kind));
  const riskyRows = rankRiskyAssets(
    rows.map((row) => ({
      assetId: row.asset.id,
      displayName: row.asset.displayName,
      assetType: row.asset.type,
      statusKind: row.status.kind,
      criticalHigh: criticalHigh(row.summary),
      openCveCount: row.openCveCount,
    })),
  );

  // 활동 피드: 최근 run 20건 + 자산 등록 이벤트를 병합해 10건
  const assetNameById = new Map(assets.map((a) => [a.id, a.displayName]));
  const feedEvents = buildActivityFeed(
    allRuns.slice(0, 20).map((run) => {
      const summary = run.status === "succeeded" ? getRunRiskSummary(run.id) : null;
      return {
        runId: run.id,
        assetName: (run.assetId && assetNameById.get(run.assetId)) ?? getRepoDisplayName(run.repoUrl),
        status: run.status,
        failCount: summary ? summary.statusCounts.fail : null,
        reviewCount: summary ? summary.statusCounts.review : null,
        at: run.updatedAt,
      };
    }),
    assets.map((a) => ({ assetId: a.id, assetName: a.displayName, at: a.createdAt })),
  );
  const now = new Date();
  const anyRunning = rows.some((row) => row.status.kind === "running");

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh active={anyRunning} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">보안 현황 개요</h1>
          <p className="text-[13px] text-muted">전체 자산의 보안 점검 현황 요약</p>
        </div>
        <Link
          href="/assets/new"
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          자산 등록
        </Link>
      </div>

      {assets.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <p className="text-sm text-muted">등록된 자산이 없습니다.</p>
            <Link
              href="/assets/new"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              첫 자산 등록하기
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 메인 컬럼 (2/3) */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            {/* 1. KPI 스탯 타일 */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <SectionLabel>총 자산</SectionLabel>
                <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">
                  {assets.length}
                </div>
                <div className="mt-1 text-[13px] text-muted">
                  레포 {repoCount} · 서버 {serverCount}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <SectionLabel>취약 자산</SectionLabel>
                <div
                  className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${vulnerableCount > 0 ? "text-fail" : ""}`}
                >
                  {vulnerableCount}
                </div>
                <div className="mt-1 text-[13px] text-muted">마지막 점검 결과 취약</div>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <SectionLabel>미해결 CVE</SectionLabel>
                <div
                  className={`mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] ${criticalHighCves.length > 0 ? "text-fail" : ""}`}
                >
                  {openCves.length}
                </div>
                <div className="mt-1 text-[13px] text-muted">
                  Critical·High {criticalHighCves.length}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <SectionLabel>활성 스케줄</SectionLabel>
                <div className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em]">
                  {activeScheduleCount}
                </div>
                <div className="mt-1 text-[13px] text-muted">정기 점검 자산</div>
              </div>
            </div>

            {/* 2. 종합 점수 게이지 + 상태 분포 도넛 */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="종합 보안 점수">
                <SecurityScoreGauge score={score} grade={grade} />
              </Card>
              <Card title="자산 상태 분포">
                <AssetStatusDonut buckets={distribution} total={assets.length} />
              </Card>
            </div>

            {/* 3. 위험 자산 TOP 5 */}
            <Card
              title="위험 자산 TOP 5"
              bodyClassName="p-0"
              action={
                <Link href="/assets" className="text-[13px] font-semibold text-primary hover:underline">
                  전체 자산 보기 →
                </Link>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3"><SectionLabel>자산</SectionLabel></th>
                      <th className="px-5 py-3"><SectionLabel>타입</SectionLabel></th>
                      <th className="px-5 py-3"><SectionLabel>상태</SectionLabel></th>
                      <th className="px-3 py-3 text-center"><SectionLabel>C/H</SectionLabel></th>
                      <th className="px-3 py-3 text-center"><SectionLabel>CVE</SectionLabel></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {riskyRows.map((row) => {
                      const badge = ASSET_STATUS_BADGE[row.statusKind];
                      return (
                        <tr key={row.assetId} className="hover:bg-bg">
                          <td className="px-5 py-3">
                            <Link
                              href={`/assets/${row.assetId}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {row.displayName}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-muted">
                            {row.assetType === "repo" ? "레포" : "서버"}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-[13px]">
                            {row.criticalHigh > 0 ? row.criticalHigh : "—"}
                          </td>
                          <td
                            className={`px-3 py-3 text-center font-mono text-[13px] ${row.openCveCount > 0 ? "text-fail" : ""}`}
                          >
                            {row.assetType === "server" ? row.openCveCount : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 4. 고위험 CVE TOP 5 (기존 유지) */}
            <Card title="고위험 CVE TOP 5" bodyClassName={topCves.length === 0 ? "p-5" : "p-0"}>
              {topCves.length === 0 ? (
                <p className="text-[13px] text-muted italic">위험 CVE 없음</p>
              ) : (
                <ul className="divide-y divide-border">
                  {topCves.map((cve) => (
                    <li key={cve.id}>
                      <Link
                        href={`/assets/${cve.assetId}`}
                        className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg"
                      >
                        <span className="font-mono text-[13px] font-bold text-fail">{cve.cveId}</span>
                        <span className="text-muted">{cve.assetName}</span>
                        <span className="font-mono text-[13px] text-muted">
                          {cve.packageName}@{cve.packageVersion}
                        </span>
                        <span className="ml-auto font-mono text-[13px] font-bold">
                          {cve.cvssScore != null ? `CVSS ${cve.cvssScore.toFixed(1)}` : cve.severity.toUpperCase()}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* 사이드 컬럼 (1/3): 최근 활동 피드 */}
          <div>
            <ActivityFeedCard events={feedEvents} now={now} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <LocalImageFallbackForm />
      </div>
    </main>
  );
}
```

참고: `ASSET_STATUS_BADGE`(`src/app/_components/assetStatusBadge.ts`)는 `Record<AssetStatusKind, …>`로 7개 kind 전부를 커버함(확인 완료) — `ASSET_STATUS_BADGE[row.statusKind]`는 그대로 타입 안전하다.

- [ ] **Step 4: 전체 테스트·타입·린트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run && npx tsc --noEmit && npx eslint src/`
Expected: 기존 721개 + 신규 19개 테스트 전부 PASS, tsc/eslint 출력 없음

- [ ] **Step 5: 실물 확인 (dev 서버)**

빈 상태 확인 후, 미점검 자산 3개를 시드해서 차트가 그려지는지 확인:

```bash
sqlite3 data/app.db "INSERT INTO assets (id, type, project_id, display_name, repo_url, host_ip, hostname, ssh_port, auth_type, username, encrypted_secret, os, owner, dockerfile_path, created_at) VALUES
 ('seed-1','repo',NULL,'seed-repo-1','https://github.com/seed/one',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-07-11T02:00:00.000Z'),
 ('seed-2','repo',NULL,'seed-repo-2','https://github.com/seed/two',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-07-11T02:10:00.000Z'),
 ('seed-3','repo',NULL,'seed-repo-3','https://github.com/seed/three',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-07-11T02:20:00.000Z');"
```

브라우저에서 `http://localhost:3000/` 확인 (로그인 세션 필요 — 유저가 확인):
- 게이지: 90점(미점검 -10)·"안전" 표시
- 도넛: 미점검 단색 링 + 범례 "미점검 3"
- 위험 자산 TOP 5: seed 3개, 상태 "미점검"
- 활동 피드: "자산 등록" 3건, 상대 시간 표시
- 다크 모드 토글 후 색 확인

확인 후 시드 제거:

```bash
sqlite3 data/app.db "DELETE FROM assets WHERE id IN ('seed-1','seed-2','seed-3');"
```

- [ ] **Step 6: 커밋**

```bash
git add src/app/page.tsx src/app/_components/AutoRefresh.tsx src/app/_components/dashboard/ActivityFeedCard.tsx "src/app/projects/[id]/page.tsx"
git rm --cached "src/app/projects/[id]/AutoRefresh.tsx" 2>/dev/null || true
git commit -m "feat: 대시보드 2단 재구성 — 점수 게이지·도넛·TOP5·사이드 활동 피드 (#dashboard-visibility)"
```
