# AI 판정(review 흡수) #2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude 분석 단계가 룰이 보류한 `review` 항목만 수집 증거로 pass/fail 판정하게 하여 수동 검토를 줄인다(룰 판정은 불변, Claude off면 review 유지).

**Architecture:** `verdict` 필드를 분석 스키마에 추가하고, 순수 헬퍼 `applyVerdict(ruleStatus, verdict)`가 "review만 AI verdict로 대체" 규칙을 강제한다. `check_results.source`(rule|ai) 컬럼을 추가해 판정 주체를 저장하고, review→verdict인 경우 행의 status를 UPDATE + source='ai'. decorate는 저장된 source를 사용한다. UI는 AI 판정 항목에 배지/필터를 노출한다.

**Tech Stack:** TypeScript, better-sqlite3, vitest, Anthropic SDK(@anthropic-ai/sdk, zod schema), Next.js.

## Global Constraints

- Node 24로 테스트: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 `npx vitest run`.
- 게이트(커밋 전): `npx tsc --noEmit` && `npx eslint <touched>` && 관련 vitest 통과.
- 안전장치: AI는 `review` → {`pass`,`fail`,`review`}만 가능. 룰의 pass/fail/skip은 **코드 레벨에서** 절대 불변(프롬프트만 믿지 않음).
- Claude 분석은 기본 off(`CLAUDE_ANALYSIS_ENABLED`) 유지 — off면 전 항목 review·source='rule'.
- AI refusal/오류는 해당 항목 review 유지, 나머지 계속(부분 실패 허용, 기존 원칙).
- `source`의 의미 = 판정 주체(verdict provenance). 분석 리포트 존재 여부와 분리한다.

---

## File Structure

- Modify: `src/lib/claude/schema.ts` — `verdict` 필드 추가.
- Modify: `src/lib/claude/analyze.ts` — 프롬프트 review 분기, `verdict` 반환.
- Create: `src/lib/claude/verdict.ts` — 순수 헬퍼 `applyVerdict`.
- Modify: `src/lib/claude/index.ts` — `analyzeAndSaveChecks` DI + verdict 적용(행 갱신).
- Modify: `src/lib/db/index.ts` — `check_results.source` ADD COLUMN.
- Modify: `src/lib/checks/store.ts` — source 저장/조회 + `updateCheckVerdict`.
- Modify: `src/lib/checks/types.ts` — `StoredCheckResult.source`.
- Modify: `src/app/api/runs/[id]/route.ts` — decorate가 `result.source` 사용.
- Modify: `src/app/runs/[id]/report/ReportView.tsx` — 리스트 배지, 상세 라벨, 툴팁, AI 판정 필터.
- Modify: `src/app/runs/[id]/RunStatus.tsx` — 요약 문구 정합화.
- Tests: 각 대응 `.test.ts`.

---

## Task 1: applyVerdict 순수 헬퍼 (안전 규칙)

**Files:** Create `src/lib/claude/verdict.ts`, Test `src/lib/claude/verdict.test.ts`

**Interfaces:**
- Produces: `applyVerdict(ruleStatus: CheckStatus, verdict: CheckStatus): { status: CheckStatus; source: "rule" | "ai" }`.

- [ ] **Step 1: 실패 테스트** — `verdict.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyVerdict } from "./verdict";

describe("applyVerdict", () => {
  it("review + pass/fail verdict → AI-sourced verdict", () => {
    expect(applyVerdict("review", "fail")).toEqual({ status: "fail", source: "ai" });
    expect(applyVerdict("review", "pass")).toEqual({ status: "pass", source: "ai" });
  });
  it("review + review verdict → stays review, rule-sourced", () => {
    expect(applyVerdict("review", "review")).toEqual({ status: "review", source: "rule" });
  });
  it("non-review rule status is NEVER changed, whatever the AI verdict", () => {
    expect(applyVerdict("pass", "fail")).toEqual({ status: "pass", source: "rule" });
    expect(applyVerdict("fail", "pass")).toEqual({ status: "fail", source: "rule" });
    expect(applyVerdict("skip", "fail")).toEqual({ status: "skip", source: "rule" });
  });
  it("review + a non-pass/fail verdict (skip/not_automated) → stays review", () => {
    expect(applyVerdict("review", "skip")).toEqual({ status: "review", source: "rule" });
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/claude/verdict.test.ts` → FAIL.

- [ ] **Step 3: 구현** — `src/lib/claude/verdict.ts`:

```ts
import type { CheckStatus } from "@/lib/catalog/types";

// 선택 모델 안전장치: AI는 룰이 "review"로 보류한 항목만 판정할 수 있고,
// 그 경우에도 pass/fail만 채택한다. 룰이 낸 pass/fail/skip은 어떤 AI verdict가
// 와도 그대로 유지된다(프롬프트가 아니라 코드로 강제).
export function applyVerdict(
  ruleStatus: CheckStatus,
  verdict: CheckStatus,
): { status: CheckStatus; source: "rule" | "ai" } {
  if (ruleStatus === "review" && (verdict === "pass" || verdict === "fail")) {
    return { status: verdict, source: "ai" };
  }
  return { status: ruleStatus, source: "rule" };
}
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/claude/verdict.ts src/lib/claude/verdict.test.ts
git commit -m "feat: applyVerdict 안전 헬퍼(review만 AI 판정 허용) (#ai-review)"
```

---

## Task 2: 분석 스키마 verdict + 프롬프트 review 분기

**Files:** Modify `src/lib/claude/schema.ts`, `src/lib/claude/analyze.ts`

**Interfaces:**
- Consumes: 없음(외부 API).
- Produces: `ClaudeAnalysis.verdict: CheckStatus`; `analyzeCheck` 반환에 `verdict` 포함(review 입력이 아니면 입력 status와 동일).
- 참고: `analyzeCheck`는 실제 Anthropic API를 호출하므로 여기선 실제 호출 테스트를 하지 않는다(E2E=Task 7). 이 태스크의 gate는 `tsc`/`eslint`, 그리고 스키마/반환 형태를 tsc로 검증한다.

- [ ] **Step 1: 스키마에 verdict 추가** — `src/lib/claude/schema.ts`의 `ClaudeAnalysisSchema`에 필드 추가:

```ts
  verdict: z.enum(["pass", "fail", "review", "skip", "not_automated"]),
```
  (`ClaudeAnalysis` 타입은 자동 반영.)

- [ ] **Step 2: 프롬프트 분기 + verdict 반환** — `src/lib/claude/analyze.ts`:
  - SYSTEM_PROMPT 하단에 review 정책을 추가:
    ```
    판정(verdict) 규칙:
    - 입력 status가 "review"인 경우에만: 제공된 evidence로 확정할 수 있으면 verdict를 "pass" 또는 "fail"로,
      evidence가 불충분하면 "review"로 반환하세요.
    - 입력 status가 review가 아니면: verdict는 반드시 입력 status와 동일해야 합니다(판정을 바꾸지 마세요).
    ```
  - userPrompt에 review 여부에 따른 지시를 추가:
    ```ts
    const verdictInstruction =
      result.status === "review"
        ? `이 항목은 룰이 판정을 보류(review)했습니다. evidence로 확정 가능하면 verdict를 "pass"/"fail"로, 아니면 "review"로 반환하세요.`
        : `verdict는 "${result.status}"를 그대로 반환하세요(판정 변경 금지).`;
    ```
    이를 userPrompt 문자열에 이어붙인다.
  - 반환 객체에 verdict를 포함하되, **비-review 입력은 코드로도 고정**:
    ```ts
    const rawVerdict = response.parsed_output.verdict;
    const verdict = result.status === "review" ? rawVerdict : result.status;
    return {
      ...response.parsed_output,
      id: item.id,
      status: result.status,   // 기존대로: 리포트에 담기는 status는 룰 값(판정 적용은 index.ts에서)
      severity: item.severity,
      verdict,
    };
    ```

- [ ] **Step 3: 게이트** — `npx tsc --noEmit` (스키마/반환 타입 일치 확인), `npx eslint src/lib/claude/schema.ts src/lib/claude/analyze.ts`.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/claude/schema.ts src/lib/claude/analyze.ts
git commit -m "feat: 분석 스키마 verdict + review 항목 판정 프롬프트 분기 (#ai-review)"
```

---

## Task 3: check_results.source 컬럼 + store 저장/조회 + updateCheckVerdict

**Files:** Modify `src/lib/db/index.ts`, `src/lib/checks/store.ts`, `src/lib/checks/types.ts`, Test `src/lib/checks/store.test.ts`

**Interfaces:**
- Produces: `check_results.source TEXT` (기본 'rule'); `StoredCheckResult.source: "rule"|"ai"`; `updateCheckVerdict(runId, itemId, status: CheckStatus, db): void` (source='ai'로 갱신); `saveCheckResults`가 source='rule'로 저장; `listCheckResults`가 source 반환(레거시 null→'rule').

- [ ] **Step 1: 실패 테스트** — `src/lib/checks/store.test.ts`에 추가:

```ts
import { updateCheckVerdict } from "./store";

it("saves source='rule' by default and updateCheckVerdict flips to ai", () => {
  const db = createInMemoryDb();
  const run = createRun("https://github.com/o/r.git", "git", null, db); // 기존 헬퍼 관례
  saveCheckResults(run.id, [{ id: "U-16", status: "review", evidence: "e" }], db);
  expect(listCheckResults(run.id, db)[0].source).toBe("rule");
  updateCheckVerdict(run.id, "U-16", "fail", db);
  const row = listCheckResults(run.id, db)[0];
  expect(row.status).toBe("fail");
  expect(row.source).toBe("ai");
});
```
  (createRun import는 기존 store.test.ts 관례를 따른다.)

- [ ] **Step 2: 실패 확인** — FAIL (`no such column: source` / updateCheckVerdict 없음).

- [ ] **Step 3: 마이그레이션** — `src/lib/db/index.ts` `migrate()`에 기존 ADD COLUMN 패턴대로:

```ts
const checkCols2 = db.prepare(`PRAGMA table_info(check_results)`).all() as { name: string }[];
if (!checkCols2.some((c) => c.name === "source")) {
  db.exec(`ALTER TABLE check_results ADD COLUMN source TEXT NOT NULL DEFAULT 'rule'`);
}
```
  그리고 초기 `CREATE TABLE IF NOT EXISTS check_results (...)`에 `source TEXT NOT NULL DEFAULT 'rule'` 추가.

- [ ] **Step 4: 타입** — `src/lib/checks/types.ts`의 `StoredCheckResult`에 `source: CheckResultSource;` 추가(`CheckResultSource`는 이미 export됨).

- [ ] **Step 5: store 구현** — `src/lib/checks/store.ts`:
  - `CheckResultRow`에 `source: "rule" | "ai"` 추가.
  - `saveCheckResults`는 INSERT에 `source`를 명시하지 않아도 DEFAULT 'rule'로 저장되나, 명시성을 위해 컬럼/값 추가(선택). 최소 변경으로 DEFAULT에 의존해도 됨 — 단 `listCheckResults`가 source를 읽으려면 컬럼이 있어야 함(마이그레이션으로 보장).
  - `listCheckResults` 반환에 `source: row.source ?? "rule"` 추가.
  - 신규 함수:
    ```ts
    export function updateCheckVerdict(
      runId: string, itemId: string, status: CheckStatus, db: Database = getDb(),
    ): void {
      db.prepare(
        `UPDATE check_results SET status = @status, source = 'ai' WHERE run_id = @runId AND item_id = @itemId`,
      ).run({ status, runId, itemId });
    }
    ```

- [ ] **Step 6: 통과 + 전체 스위트** — `npx vitest run` → PASS(마이그레이션이 기존 행 영향 없는지 포함).

- [ ] **Step 7: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/db/index.ts src/lib/checks/store.ts src/lib/checks/types.ts src/lib/checks/store.test.ts
git commit -m "feat: check_results.source 컬럼 + updateCheckVerdict (#ai-review)"
```

---

## Task 4: analyzeAndSaveChecks — verdict 적용(행 갱신) + DI

**Files:** Modify `src/lib/claude/index.ts`, Test `src/lib/claude/index.test.ts`

**Interfaces:**
- Consumes: `applyVerdict`(Task 1), `analyzeCheck`(Task 2), `updateCheckVerdict`(Task 3).
- Produces: `analyzeAndSaveChecks(runId, results, db, deps?)` — `deps.analyze` 주입 가능(기본 `analyzeCheck`). review→pass/fail이면 `updateCheckVerdict` 호출; 리포트는 기존대로 저장.

- [ ] **Step 1: 실패 테스트** — `src/lib/claude/index.test.ts`에 추가(실제 API 없이 DI로):

```ts
import { saveCheckResults, listCheckResults } from "@/lib/checks/store";
import type { ClaudeAnalysis } from "./schema";

it("adjudicates review→fail (source ai), leaves rule pass/fail untouched", async () => {
  process.env.CLAUDE_ANALYSIS_ENABLED = "true";
  const run = createRun("https://github.com/o/r.git", "git", null, db);
  saveCheckResults(run.id, [
    { id: "U-16", status: "review", evidence: "e1" },
    { id: "U-18", status: "fail", evidence: "e2" },
  ], db);
  const fakeReport = (id: string, verdict: ClaudeAnalysis["verdict"]): ClaudeAnalysis => ({
    id, status: "review", severity: "Medium", verdict,
    title: "t", evidence: "e", reason: "r", remediation: "m", example: "x",
  });
  const analyze = async ({ result }: { result: { id: string; status: string } }) =>
    result.id === "U-16" ? fakeReport("U-16", "fail") : fakeReport("U-18", "fail");
  await analyzeAndSaveChecks(run.id, [
    { id: "U-16", status: "review", evidence: "e1" },
    { id: "U-18", status: "fail", evidence: "e2" },
  ], db, { analyze });
  const rows = Object.fromEntries(listCheckResults(run.id, db).map((r) => [r.id, r]));
  expect(rows["U-16"].status).toBe("fail");
  expect(rows["U-16"].source).toBe("ai");
  // U-18은 룰이 이미 fail → AI가 뭘 반환하든 rule 유지
  expect(rows["U-18"].status).toBe("fail");
  expect(rows["U-18"].source).toBe("rule");
  delete process.env.CLAUDE_ANALYSIS_ENABLED;
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `src/lib/claude/index.ts`:

```ts
import { applyVerdict } from "./verdict";
import { updateCheckVerdict } from "@/lib/checks/store";

export interface AnalyzeDeps {
  analyze: typeof analyzeCheck;
}
const defaultDeps: AnalyzeDeps = { analyze: analyzeCheck };

export async function analyzeAndSaveChecks(
  runId: string,
  results: CheckResult[],
  db: Database = getDb(),
  deps: AnalyzeDeps = defaultDeps,
): Promise<void> {
  if (!CLAUDE_ANALYSIS_ENABLED) return;

  for (const result of results) {
    const item = getCatalogItem(result.id);
    if (!item) throw new Error(`카탈로그에 없는 항목 id: ${result.id}`);
    const report = await deps.analyze({ item, result });
    saveAnalysisReport(runId, report, db);
    // review였던 항목만, AI verdict가 pass/fail이면 저장된 결과를 갱신한다.
    const applied = applyVerdict(result.status, report.verdict);
    if (applied.source === "ai") {
      updateCheckVerdict(runId, result.id, applied.status, db);
    }
  }
}
```

- [ ] **Step 4: 통과 + 전체 스위트** — `npx vitest run` → PASS. 기존 "no-op unless enabled" 테스트도 유지.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/claude/index.ts
git add src/lib/claude/index.ts src/lib/claude/index.test.ts
git commit -m "feat: analyzeAndSaveChecks가 review를 AI verdict로 흡수(행 갱신) (#ai-review)"
```

---

## Task 5: decorate가 저장된 source 사용 + riskSummary 반영 검증

**Files:** Modify `src/app/api/runs/[id]/route.ts`, Test `src/lib/checks/riskSummary.test.ts`(보강)

**Interfaces:**
- Consumes: `listCheckResults`(source 포함, Task 3).
- Produces: decorate의 `source`가 `result.source`(check_results)에서 옴 — 분석 리포트 존재 여부가 아니라 판정 주체.

- [ ] **Step 1: decorate 수정** — `src/app/api/runs/[id]/route.ts`의 매핑에서:
  - 기존 `source: report ? "ai" : "rule"` → **`source: result.source`** 로 변경(`result`는 `listCheckResults` 항목, 이제 `source` 보유).
  - reason/remediation/example은 기존대로 `report`에서(설명은 여전히 리포트에서 옴). AI 판정인데 리포트가 있으면 reason도 함께 표시됨.

- [ ] **Step 2: riskSummary 반영 테스트(보강)** — `src/lib/checks/riskSummary.test.ts`에 추가(행 갱신이 집계에 반영됨을 잠금):

```ts
it("counts an AI-adjudicated (review→fail) item as fail, not review", () => {
  const summary = computeRiskSummary([
    { status: "fail", severity: "High" },   // AI가 review→fail로 갱신한 항목도 결국 status=fail로 집계
    { status: "review", severity: null },
  ]);
  expect(summary.statusCounts.fail).toBe(1);
  expect(summary.statusCounts.review).toBe(1);
});
```
  (computeRiskSummary는 넘겨받은 status로 집계하므로 별도 코드 변경 없이 조정된 status가 자동 반영됨을 문서화하는 테스트.)

- [ ] **Step 3: 전체 스위트** — `npx vitest run` → PASS. (decorate 변경으로 기존 api/runs 테스트가 source를 기대하면 갱신.)

- [ ] **Step 4: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint "src/app/api/runs/[id]/route.ts"
git add "src/app/api/runs/[id]/route.ts" src/lib/checks/riskSummary.test.ts
git commit -m "feat: decorate가 판정 주체(check_results.source)를 사용 (#ai-review)"
```

---

## Task 6: UI — AI 판정 배지·필터·요약

**Files:** Modify `src/app/runs/[id]/report/ReportView.tsx`, `src/app/runs/[id]/RunStatus.tsx`

**Interfaces:**
- Consumes: `DecoratedCheckResult.source`(이제 판정 주체).
- 참고: UI. 자동 테스트 없이 수동 검증(Step 5) + tsc/eslint.

- [ ] **Step 1: 리스트 행 AI 판정 배지** — `ReportView.tsx` 항목 리스트(각 check 행, 상태 배지 옆)에 AI 판정 표시:

```tsx
{check.source === "ai" && (
  <span title="룰이 판정을 보류(검토)한 항목을 AI가 점검 증거로 판정함"
    className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary">
    <ClaudeSparkleIcon /> AI 판정
  </span>
)}
```
  `ClaudeSparkleIcon`이 ReportView에 없으면 RunStatus의 정의를 공용 컴포넌트로 추출하거나 ReportView에 동일 SVG를 로컬 정의(기존 파일 관례 따름).

- [ ] **Step 2: 상세 패널 SOURCE 라벨** — `SOURCE_LABELS`의 `ai` 문구를 `"AI 분석"` → `"AI 판정"`으로. (툴팁은 Step 1 배지에 이미 부여.)

- [ ] **Step 3: AI 판정 필터 facet** — 기존 필터 상태 옆에 `aiOnly` 토글 추가:

```tsx
const [aiOnly, setAiOnly] = useState(false);
const hasAiVerdicts = checks.some((c) => c.source === "ai");
// filtered 술어에 AND: (!aiOnly || c.source === "ai")
```
  칩 UI는 기존 `chipStyle` 패턴으로 "AI 판정" 토글을 추가하되, `hasAiVerdicts`일 때만 렌더. `filtered` 계산에 `(!aiOnly || c.source === "ai")` 조건을 AND로 포함.

- [ ] **Step 4: RunStatus 요약 정합화** — `RunStatus.tsx`의 `aiCount`(이미 `checks.filter(c=>c.source==="ai")`) 기반 문구를 "AI 판정 N건"으로 표기(예: 하단 요약의 "개선안 생성됨" 부분을 `aiCount>0`일 때 `AI 판정 {aiCount}건 <ClaudeSparkleIcon/>`으로). 판정 주체 의미에 맞게 카피만 조정.

- [ ] **Step 5: 수동 검증** — `npm run dev` + 실제 run(가능하면 Task 7 후):
  - AI 판정 항목에 리스트 배지·상세 "AI 판정" 라벨·툴팁이 보인다.
  - "AI 판정" 필터 토글이 해당 항목이 있을 때만 나타나고 동작한다.
  - RunStatus 요약이 "AI 판정 N건"으로 표시된다.

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint "src/app/runs/[id]/report/ReportView.tsx" "src/app/runs/[id]/RunStatus.tsx"
git add "src/app/runs/[id]/report/ReportView.tsx" "src/app/runs/[id]/RunStatus.tsx"
git commit -m "feat: AI 판정 배지·필터·요약 UI (#ai-review)"
```

---

## Task 7: 실제 Claude E2E 검증

**Files:** (코드 변경 없음 — 검증. 버그 발견 시 최소 수정 후 별도 커밋.)

- [ ] **Step 1: 전체 단위 테스트 그린** — `npx vitest run` PASS.

- [ ] **Step 2: 실제 Claude 켜고 점검** — `ANTHROPIC_API_KEY`가 있는 환경에서 `CLAUDE_ANALYSIS_ENABLED=true`로,
  review 항목이 나오는 자산(예: nginx WEB-01/02, apache WEB-25, unix 일부)을 실제 점검(tsx로 프로덕션 경로:
  resolveCheckPlan→ansible→evaluatePlan→saveCheckResults→analyzeAndSaveChecks, 또는 앱 파이프라인).
  기대: 일부 review 항목이 `pass`/`fail`로 흡수되고 `check_results.source='ai'`로 저장됨.

- [ ] **Step 3: 폴백 검증** — `CLAUDE_ANALYSIS_ENABLED` 미설정으로 같은 자산 재점검 → 모든 review 유지, source='rule'.

- [ ] **Step 4: 표시 검증** — 해당 run의 `/runs/<id>/report`에서 AI 판정 배지·필터·요약, 대시보드/위험요약의
  review 감소·fail·pass 반영 확인.

- [ ] **Step 5: 최종 게이트** — `npx tsc --noEmit && npx eslint <touched> && npx vitest run` 그린.

---

## Self-Review (완료)

- **스펙 커버리지:** verdict 스키마/프롬프트(T2), 안전 헬퍼(T1), 저장·source(T3), 흡수 로직(T4), decorate/집계(T5), UI(T6), 실제 검증(T7) 모두 태스크 존재.
- **플레이스홀더:** 각 코드/테스트 완전 포함.
- **타입 일관성:** `applyVerdict(ruleStatus, verdict)→{status,source}`, `ClaudeAnalysis.verdict`, `updateCheckVerdict(runId,itemId,status,db)`, `StoredCheckResult.source`, decorate `source: result.source`, `analyzeAndSaveChecks(...,deps?)` DI가 태스크 전반 일치.
- **주의:** 안전장치(비-review 불변)는 T1 헬퍼 + T2 코드 고정 + T4 적용의 3중으로 보장. Claude 실제 호출은 T7에서만(T2/T4는 tsc/DI로 검증). 마이그레이션은 기존 ADD COLUMN 패턴.
