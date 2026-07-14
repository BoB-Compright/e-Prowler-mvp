# 공유 뷰 보안 점수(게이지) 추가 설계

> 작성일: 2026-07-15
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
PM 공유 뷰 상단에 관리자 대시보드와 동일한 **프로젝트 종합 보안 점수 게이지**를 추가한다. 기존
`SecurityScoreGauge` 컴포넌트와 `computeSecurityScore` 산정식을 그대로 재사용한다.

## 확정 결정
- **프로젝트 종합 점수(상단)**: 이 프로젝트 자산 전체를 집계한 점수 1개를 공유 뷰 상단(자산 선택 위)에 게이지로.
- **CVE 감점 제외**: 공유 뷰는 CVE 내역 비노출 정책이므로 산정 입력 `criticalHighOpenCves = 0`으로 둔다.
  (나머지 감점 요소 — 취약 자산 비율·C/H fail 항목·미점검 비율 — 은 대시보드와 동일.)

## 아키텍처

### ① 공유 API가 프로젝트 점수 계산·반환 — `src/app/api/share/[token]/route.ts`
기존 `publicAssets`(verdict)·`perAsset`(checks)를 그대로 활용해 점수 입력을 산출한다:
```ts
import { computeSecurityScore } from "@/lib/dashboard/securityScore";
import { computeRiskSummary } from "@/lib/checks/riskSummary";
// ...
const scoreInput = {
  totalAssets: publicAssets.length,
  vulnerableAssets: publicAssets.filter((a) => a.verdict === "fail").length,
  uncheckedAssets: publicAssets.filter((a) => a.verdict === "none").length,
  criticalHighCheckFindings: perAsset.reduce((sum, e) => {
    const s = computeRiskSummary(e.checks);
    return sum + s.severityCounts.Critical + s.severityCounts.High;
  }, 0),
  criticalHighOpenCves: 0, // 공유 뷰: CVE 감점 제외(정책)
};
const score = computeSecurityScore(scoreInput); // { score, grade }
```
응답에 `score: { score: number; grade: ScoreGrade }` 필드를 추가한다(기존 `{ project, assets, perAsset }`에 더함).
- `computeSecurityScore`·`computeRiskSummary`는 순수 함수(better-sqlite3 미의존)라 API에서 안전.
- 산정 방식은 대시보드(page.tsx)와 동일하되 프로젝트 자산으로 스코프, CVE만 0.

### ② 공유 뷰 상단에 게이지 — `src/app/share/[token]/ShareGate.tsx`
비밀번호 통과 후 프로젝트 헤더 아래·자산 선택 위에 기존 `SecurityScoreGauge`를 렌더:
```tsx
import { SecurityScoreGauge } from "@/app/_components/dashboard/SecurityScoreGauge";
// ...
{data.score && (
  <Card className="mb-5"> {/* 또는 기존 카드 톤 컨테이너 */}
    <SectionLabel>종합 보안 점수</SectionLabel>
    <SecurityScoreGauge score={data.score.score} grade={data.score.grade} />
  </Card>
)}
```
- `SecurityScoreGauge`는 이미 client 컴포넌트("use client", useCountUp)라 client인 ShareGate에서 그대로 사용 가능.
- `ScoreGrade` 타입은 `@/lib/dashboard/securityScore`에서 타입 import.
- 모바일 반응형: 게이지가 `max-w-[220px]`라 중앙 정렬로 자연스럽게 축소됨.

## 데이터 흐름
```
POST /api/share/[token] → { project, assets, perAsset, score:{score,grade} }
ShareGate 상단: <SecurityScoreGauge score grade /> (프로젝트 종합)
```

## 에러/경계
- 자산 0개 프로젝트: `computeSecurityScore`가 `totalAssets<=0`이면 `{score:100, grade:"safe"}` 반환(기존 로직) — 게이지 100/안전 표시.
- `data.score` 없으면(구버전 응답 방어) 게이지 생략.
- 점수는 CVE 제외라 관리자 대시보드(플릿·CVE 포함)와 수치가 다를 수 있음(의도된 정책).

## 테스트 전략
- **API(share)**: 응답에 `score:{score,grade}` 포함, 취약 자산·C/H fail 항목이 점수에 반영, `criticalHighOpenCves`는 항상 0으로 산정(CVE와 무관하게 동일 점수), 자산 0개면 100/safe. 기존 게이트·perAsset 회귀 유지.
- **UI**: tsc/eslint/next build + 수동(상단 게이지 표시·모바일).

## 다루지 않는 것
- 자산별 점수(프로젝트 종합만).
- 점수 산정식 변경(기존 computeSecurityScore 재사용, CVE 입력만 0).
- CVE 내역/개수 공유 노출(점수 산정에서도 CVE는 0으로 제외).
