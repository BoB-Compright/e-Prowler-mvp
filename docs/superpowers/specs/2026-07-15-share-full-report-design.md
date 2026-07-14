# PM 공유 뷰 → 관리자 리포트 양식 설계

> 작성일: 2026-07-15
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
PM 공유 뷰(ShareGate)를 기존 관리자 점검 리포트(ReportView)와 동일한 양식으로 렌더한다: 상태 카드
(Total/Pass/Fail/Review), 보안 위험 요약(심각도), 카테고리·상태·프레임워크 필터, 전체 점검 항목 리스트,
선택 항목의 **AI 분석 근거**. 청중은 읽기 전용.

## 확정 결정
- **읽기 전용 풀리포트**: 점수·위험요약·전체 항목·AI 근거까지 노출. **재점검·보고서 내보내기·CVE 목록은 미포함.**
- **자산 선택 목록/탭 → 선택 자산의 리포트**(관리자 리포트가 자산(run) 단위라 자연스러움).
- **노출 정책 변경**: 공유 뷰가 기존엔 취약/검토 항목·근거 비노출이었으나, 이제 **전체 항목 + evidence + AI
  근거(reason)** 노출(사용자 확정). CVE 내역은 계속 비노출.

## 아키텍처

### ① 데코레이션 헬퍼 추출 (DRY) — `src/lib/checks/store.ts`
현재 `/api/runs/[id]/route.ts`가 인라인으로 `listCheckResults`+`listAnalysisReports`+`getCatalogItem`+
`getMitigation`을 조합해 `DecoratedCheckResult[]`를 만든다. 이 로직을 순수 헬퍼로 추출:
```ts
export function getDecoratedResults(runId: string, db?: Database): DecoratedCheckResult[]
```
- 반환 필드(기존과 동일): `id, status, evidence, title, severity, category, frameworkId, source, sourceRef,
  reason, remediation, example, mitigation`.
- **관리자 라우트는 이 헬퍼를 호출하도록 교체(동작 불변 — 회귀 없음).**

### ② 공유 API 확장 — `src/app/api/share/[token]/route.ts`
자산별 최근 성공 run에 대해 `getDecoratedResults(run.id)`를 반환(현재 fail/review findings 대체):
```ts
perAsset: Array<{
  assetId: string;
  run: { id, createdAt, repoUrl 또는 대상 표시용 } | null;  // 미점검이면 null
  checks: DecoratedCheckResult[];  // 미점검이면 []
}>
```
- **CVE는 포함하지 않는다**(admin의 cveMatches 제외). 전체 항목 + evidence + reason은 포함.
- 비밀번호 게이트(verifyShareAccess)·자산 판정 배지(getAssetStatusMap)는 그대로.
- `project`(name/pmName)·`assets`(id/displayName/type/verdict)는 유지.

### ③ 읽기 전용 리포트 컴포넌트 — `src/app/share/[token]/ShareReport.tsx` (신규, client)
props: `{ assetName: string; targetLabel: string; scannedAt: string; checks: DecoratedCheckResult[] }`.
관리자 `ReportView`의 레이아웃을 **읽기 전용**으로 재현하되 관리자 파일은 건드리지 않고 이미 공유 중인
프리미티브를 조합:
- 상태 카드 4종(Total/Pass/Fail/Review) — 클릭 시 상태 필터(`computeRiskSummary(checks)`로 카운트).
- `RiskSummaryBar summary={computeRiskSummary(checks)}`.
- 필터 칩: 카테고리(`CATEGORY_CHIP_LABELS`), 상태(`CHECK_STATUS_LABELS`, `@/lib/catalog/types`),
  프레임워크(`getFrameworks()` 중 present한 것). "AI 판정만" 토글도 포함(관리자와 동일).
- 항목 리스트(필터 적용): 상태 배지·심각도·제목·프레임워크 출처. 선택 시 상세 패널에 **AI 분석 근거
  (reason)**, evidence, 있으면 조치 가이드(mitigation.risk/fix/example) 표시.
- 관리자 전용 요소(RescanButton·보고서 내보내기·실행 상태 보기·CveList) **미포함**.
- `CATEGORY_CHIP_LABELS`는 클라이언트 안전하게 이 파일에 로컬 정의(값은 ReportView와 동일).

### ④ ShareGate 통합 — `src/app/share/[token]/ShareGate.tsx`
비밀번호 통과 후: 프로젝트 헤더 → **자산 선택 목록/탭**(각 자산 판정 배지) → 선택 자산의
`<ShareReport>`. 기존 자산 표 + findings 섹션은 이 구성으로 대체. 미점검 자산 선택 시 "점검 이력이
없습니다" 안내. 모바일 반응형 유지(자산 선택은 가로 스크롤 칩/드롭다운, 리포트는 기존 반응형 규칙).

## 데이터 흐름
```
POST /api/share/[token] (비번)
  → { project, assets[verdict], perAsset:[{assetId, run, checks[decorated]}] }  // CVE 제외
ShareGate: 자산 선택 → 그 자산 perAsset.checks → <ShareReport>
  → computeRiskSummary·필터·리스트·선택항목 AI근거/조치가이드
```

## 에러/경계
- 미점검 자산: `run=null, checks=[]` → ShareReport 대신 "점검 이력 없음" 안내.
- 잘못된/잠긴/폐기 토큰·비번 오류: 기존 게이트 로직 그대로(회귀 없음).
- 헬퍼 추출은 순수 리팩터 — 관리자 리포트 표시 동작 불변(회귀 테스트로 보장).
- evidence/reason이 빈 항목: 근거 패널에 "근거 없음/자동 판정" 등 관리자와 동일 처리(빈 값 방어).

## 테스트 전략
- **단위(`getDecoratedResults`)**: run의 항목이 title/severity/category/framework/reason/mitigation까지 데코됨.
  (관리자 라우트가 동일 shape 유지하는지 = 회귀.)
- **API(share)**: 전체 항목·evidence·reason 노출, CVE 미포함, 미점검 자산 `checks:[]`, 비번 게이트(404/401/403/423) 회귀.
- **단위(공유 필터 로직)**: 카테고리·상태·프레임워크·AI-only 필터 조합이 관리자와 동일하게 동작(가능하면 순수 함수로 분리해 테스트).
- **UI**: tsc/eslint/next build + 수동(모바일 뷰포트에서 자산 선택→리포트→항목 선택→AI 근거).

## 다루지 않는 것
- 관리자 `ReportView` 레이아웃 리팩터(공유 프리미티브·데코 헬퍼만 재사용, 렌더는 공유 전용 분리).
- CVE·재점검·보고서 내보내기 공유 노출.
- 공유 뷰에서의 항목 상태 변경/조치 실행(읽기 전용).
