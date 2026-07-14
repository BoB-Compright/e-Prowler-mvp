# 점검 카테고리 사전 선택(소요시간 조절) 설계

> 작성일: 2026-07-15
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
점검 실행 전에 사용자가 그 자산의 **후보 점검 카테고리**(컨테이너/OS/WEB/WAS/DB) 중 대상을 골라, 점검
대상 항목 수와 **소요시간을 줄일 수 있게** 한다. 미선택(전부 선택) 시 기존 전체 점검과 동일(회귀 없음).

## 확정 결정
- **진입 = 자산 목록에서 단일 자산 "점검" → 옵션 모달**. 2개 이상 선택 시 기존 bulk 전체 점검 유지.
- **옵션 = 후보 카테고리 전부 체크박스, 기본 전체 선택**. 최소 1개 필수.
- 카테고리는 자산별로 다르므로 단일 자산에만 적용(다중 선택은 전체).

## 아키텍처

### ① 계획 필터 — `filterPlanByCategories` (`src/lib/packs/resolve.ts`)
```ts
export function filterPlanByCategories(plan: CheckPlan, categories: string[] | undefined): CheckPlan
```
- `categories`가 `undefined`이거나 빈 배열이면 **plan을 그대로 반환**(회귀·전체 점검).
- 아니면 `plan.packs` 중 `pack.category`가 `categories`에 포함된 것만 남기고, `evidenceTasks`를
  `mergeEvidenceTasks(남은 packs.map(p => p.evidenceTasks))`로 재계산. `plan.mode`는 보존.
- 팩 카테고리 어휘: `"container" | "OS" | "WEB" | "WAS" | "DB"`(VendorPack.category 필드 그대로).
- 효과: 남는 팩이 줄면 evidence 태스크(ansible 프로브)도 줄어 수집·평가가 빨라진다.

### ② 후보 카테고리 노출 (서버 렌더) — `src/app/assets/page.tsx`, `AssetTable`
- `page.tsx`에서 각 자산에 대해 `resolveCheckPlan(asset).packs`의 **고유 category 배열**을 계산해
  `AssetRowData.scanCategories: string[]`로 전달(실질 구분 `kind` 추가와 동일 패턴).
  - 이미지(비-server): autodetect 고정 오토셋 → `["container","OS","WEB","WAS","DB"]`(중복 제거).
  - 서버: `["OS"]` 또는 `["OS", 선언벤더카테고리]`.
- 카테고리 라벨: `CATEGORY_LABEL = { container:"컨테이너", OS:"OS", WEB:"WEB", WAS:"WAS", DB:"DB" }`
  (신규 상수 — `src/lib/packs/resolve.ts` 또는 별도 표시 상수 파일).

### ③ UI — 단일 자산 점검 옵션 모달 (`src/app/assets/AssetTable.tsx`)
- 선택 자산이 **정확히 1개**일 때 "점검" 클릭 → 지난 사이클의 `Modal`로 옵션 표시:
  - 그 자산의 `scanCategories`를 체크박스로(라벨은 CATEGORY_LABEL), **기본 전부 체크**.
  - "점검 시작" → `POST /api/runs { assetId, categories }`(선택된 카테고리 배열).
  - 전부 해제 시 "점검 시작" 비활성(최소 1개).
- 선택 자산이 **2개 이상**이면 "점검"은 기존 `POST /api/assets/bulk/scan`(전체 카테고리) 그대로.
- 진행 중(요청 중) 중복 방지 가드(기존 busy 패턴).

### ④ 백엔드 threading
- `POST /api/runs`(단일): body에서 `categories`를 `string[]`일 때만 수용(원소도 string 필터), 그 외 무시.
  - 이미지: `runPipeline(run.id, source, deps, db, { categories })` → `deps.runChecks(dockerfilePath,
    containerName, asset, categories)` → `runAllChecks`가 `resolveCheckPlan` 후 `filterPlanByCategories(plan, categories)`.
  - 서버: `runServerScanPipeline(run, asset, deps, db, { categories })` → `resolveCheckPlan` 후 필터.
- `runAllChecks(dockerfilePath, containerName, asset?, categories?)` 시그니처에 `categories?: string[]` 추가.
- 모두 선택(=전체)이면 필터는 no-op → 기존 동작.

## 데이터 흐름
```
page.tsx: resolveCheckPlan(asset).packs → 고유 category → AssetRowData.scanCategories
단일 점검: AssetTable 모달(체크박스) → POST /api/runs {assetId, categories}
  → runPipeline/runServerScanPipeline(categories)
  → resolveCheckPlan → filterPlanByCategories(plan, categories)
  → 좁혀진 evidenceTasks 수집 + evaluatePlan → 더 적은 항목·더 짧은 소요시간
```

## 에러/경계
- categories 미제공/빈 배열/비배열 → 전체 점검(no-op 필터).
- categories에 그 자산 계획에 없는 값이 섞여도 무해(교집합만 남음). 전부 매칭 안 되면 → 빈 packs가 되지
  않도록: 필터 결과 packs가 0개면 전체 계획으로 폴백(안전). (UI는 최소 1개 강제하므로 정상 경로에선 발생 안 함.)
- 다중 선택 bulk 경로는 카테고리 미적용(기존 유지).
- 스케줄 점검(scheduler)·리포트 재점검은 categories 없이 호출 → 전체(회귀 없음).

## 테스트 전략
- **단위(`filterPlanByCategories`)**: (a) 부분집합 필터로 해당 카테고리 팩만 남음, (b) evidenceTasks 재계산,
  (c) mode 보존, (d) undefined/빈 배열→plan 동일 참조/동일 내용, (e) 매칭 0개→전체 폴백.
- **단위(`runAllChecks` categories)**: 이미지에 `["DB"]`만 주면 DB 팩만 평가(U-*/WEB-* 결과 없음), 미지정 시
  기존 전체.
- **단위(`resolveCheckPlan` 후보)**: 이미지→5종 카테고리, 서버 선언→OS(+벤더).
- **API**: `/api/runs`가 categories(string[])만 수용, 비배열/비문자 무시.
- **UI**: 단일 선택 모달·기본 전체 체크·최소 1개·다중 선택 bulk 분기는 tsc/eslint/next build + 수동.

## 다루지 않는 것
- 다중 자산 각각 다른 카테고리 지정(단일만), 카테고리 프리셋 저장/기억.
- 스케줄 점검의 카테고리 지정(항상 전체).
- 자동 탐지 자체 변경(탐지 로직은 그대로, 계획 팩만 사전 축소).
