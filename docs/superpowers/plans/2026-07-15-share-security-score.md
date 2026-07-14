# 공유 뷰 보안 점수(게이지) 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PM 공유 뷰 상단에 관리자 대시보드와 동일한 프로젝트 종합 보안 점수 게이지를 추가한다(CVE 감점 제외).

**Architecture:** 공유 API가 기존 `computeSecurityScore`(순수)로 프로젝트 스코프 점수를 계산해 응답에 `score:{score,grade}`를 더하고, ShareGate가 기존 `SecurityScoreGauge`를 상단에 렌더한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest, Tailwind v4.

## Global Constraints

- 테스트/타입/린트/빌드는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 점수 산정은 기존 `computeSecurityScore` 재사용, 프로젝트 자산으로 스코프, `criticalHighOpenCves = 0`(공유 뷰 CVE 감점 제외 정책).
- `criticalHighCheckFindings`는 대시보드와 동일하게 각 자산 `computeRiskSummary(checks).severityCounts.Critical + High` 합.
- 기존 `SecurityScoreGauge`(client, useCountUp)·디자인 토큰 그대로 사용.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: 공유 API가 프로젝트 종합 점수 계산·반환

**Files:**
- Modify: `src/app/api/share/[token]/route.ts`
- Test: `src/app/api/share/[token]/route.test.ts`

**Interfaces:**
- Consumes: `computeSecurityScore`(`@/lib/dashboard/securityScore`), `computeRiskSummary`(`@/lib/checks/riskSummary`).
- Produces(JSON 추가): `score: { score: number; grade: ScoreGrade }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/share/[token]/route.test.ts`에 추가(기존 harness·POST 호출 방식 재사용):

이 파일의 실제 호출 형태는 `jsonRequest(token, password)` + `POST(req, { params: Promise.resolve({ token }) })`이다(파일 상단 `jsonRequest` 헬퍼, 기존 성공 테스트의 프로젝트/비번 셋업 그대로 재사용):

```ts
  it("응답에 프로젝트 종합 점수(score/grade)를 포함한다", async () => {
    // 기존 성공 테스트와 동일하게 프로젝트/자산/succeeded run/check_results(취약 포함) 셋업 후:
    const res = await POST(jsonRequest(project.shareToken, "secret1234"), {
      params: Promise.resolve({ token: project.shareToken }),
    });
    const body = await res.json();
    expect(body.score).toBeTruthy();
    expect(typeof body.score.score).toBe("number");
    expect(body.score.score).toBeGreaterThanOrEqual(0);
    expect(body.score.score).toBeLessThanOrEqual(100);
    expect(["safe", "caution", "warning", "danger"]).toContain(body.score.grade);
  });
```
(주: `project`·비밀번호 문자열은 그 파일 기존 테스트가 만드는 것을 그대로 사용. 취약(fail·Critical/High) 항목이 있는 자산을 포함하면 score<100 이 되어 더 의미 있는 단언이 됨.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/share/[token]/route.test.ts"`
Expected: FAIL — `body.score` undefined.

- [ ] **Step 3: 공유 API에 점수 계산 추가**

`src/app/api/share/[token]/route.ts`: import 추가 후, `perAsset` 계산 다음에 점수 산출·응답 포함:
```ts
import { computeSecurityScore } from "@/lib/dashboard/securityScore";
import { computeRiskSummary } from "@/lib/checks/riskSummary";
// ... (publicAssets, perAsset 계산 이후) ...
  const score = computeSecurityScore({
    totalAssets: publicAssets.length,
    vulnerableAssets: publicAssets.filter((a) => a.verdict === "fail").length,
    uncheckedAssets: publicAssets.filter((a) => a.verdict === "none").length,
    criticalHighCheckFindings: perAsset.reduce((sum, e) => {
      const s = computeRiskSummary(e.checks);
      return sum + s.severityCounts.Critical + s.severityCounts.High;
    }, 0),
    criticalHighOpenCves: 0, // 공유 뷰: CVE 감점 제외(정책)
  });

  return NextResponse.json({ project: publicProject, assets: publicAssets, perAsset, score });
```
(기존 `return NextResponse.json({ project: publicProject, assets: publicAssets, perAsset });`를 위로 교체.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/share/[token]/route.test.ts" && npx tsc --noEmit`
Expected: PASS, 타입 클린.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/share/[token]/route.ts" "src/app/api/share/[token]/route.test.ts"
git commit -m "feat: 공유 API가 프로젝트 종합 보안 점수 반환(CVE 감점 제외)"
```

---

### Task 2: 공유 뷰 상단에 SecurityScoreGauge 렌더

**Files:**
- Modify: `src/app/share/[token]/ShareGate.tsx`

**Interfaces:**
- Consumes: `SecurityScoreGauge`(`@/app/_components/dashboard/SecurityScoreGauge`), `ScoreGrade`(`@/lib/dashboard/securityScore`), Task 1의 `score` 응답.

- [ ] **Step 1: ShareData에 score 추가 + import**

`src/app/share/[token]/ShareGate.tsx`:
- import 추가:
```tsx
import { SecurityScoreGauge } from "@/app/_components/dashboard/SecurityScoreGauge";
import type { ScoreGrade } from "@/lib/dashboard/securityScore";
import { SectionLabel } from "../../_components/SectionLabel";
```
(SectionLabel 경로는 이 파일의 다른 컴포넌트 import 상대경로 규칙과 동일하게 맞출 것 — Card가 `../../_components/Card`이므로 동일 패턴.)
- `ShareData` 인터페이스에 필드 추가:
```ts
  score?: { score: number; grade: ScoreGrade };
```

- [ ] **Step 2: 프로젝트 헤더 아래에 게이지 카드 렌더**

`src/app/share/[token]/ShareGate.tsx`의 프로젝트 헤더 블록(`<h1>{data.project.name}</h1>` + `담당 PM` `<p>`가 있는 곳) **바로 다음**, 자산 선택 UI **앞**에 삽입:
```tsx
        {data.score && (
          <Card className="mb-5" bodyClassName="p-5">
            <SectionLabel>종합 보안 점수</SectionLabel>
            <div className="mt-2 flex justify-center">
              <SecurityScoreGauge score={data.score.score} grade={data.score.grade} />
            </div>
          </Card>
        )}
```
(실제 파일의 헤더 닫는 위치를 읽어 정확히 그 다음에 삽입. 자산 0개 빈 상태(`등록된 자산이 없습니다`) 카드와 자산 선택 UI 사이 배치가 자연스러우면 그 위에 둘 것.)

- [ ] **Step 3: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/share/[token]/ShareGate.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 4: 전체 테스트 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run 2>&1 | tail -3`
Expected: 전부 통과.

```bash
git add "src/app/share/[token]/ShareGate.tsx"
git commit -m "feat: PM 공유 뷰 상단에 프로젝트 종합 보안 점수 게이지"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 공유 링크(비번) → 상단에 종합 보안 점수 게이지(대시보드와 동일 모양) 표시.
- 취약 자산이 섞인 프로젝트에서 점수<100, 양호만이면 높은 점수인지.
- 모바일에서 게이지가 중앙 정렬로 잘 축소되는지.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul) + cloudflared 공개 URL 200(모바일 스타일 정상).
