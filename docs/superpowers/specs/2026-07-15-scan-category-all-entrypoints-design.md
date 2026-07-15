# 모든 단일 자산 스캔 진입점에 카테고리 선택 설계

> 작성일: 2026-07-15
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
단일 자산 점검을 실행하는 **모든 진입점**(자산 상세 "점검 시작", 리포트 "재스캔", 자산 목록 단일 점검)에서
동일하게 **카테고리 사전선택 모달**이 뜨도록 통일한다. 현재는 자산 목록 단일 점검에서만 뜬다.

## 확정 결정
- 범위: **단일 자산 점검 진입점만**(자산 상세·리포트 재점검·자산 목록 단일). 통일.
- 제외: 플릿 점검(다중 자산 → 카테고리 부적합, 기존 전체 유지), 로컬 이미지 폴백(이번 범위 밖).
- 모달 UX·기본값(전체 체크·최소 1개)·POST 계약은 기존 AssetTable 단일 점검과 동일.

## 아키텍처

### ① 후보 카테고리 헬퍼 추출 (DRY) — `src/lib/packs/resolve.ts`
현재 `[...new Set(resolveCheckPlan(asset).packs.map((p) => p.category))]`가 assets/page.tsx·projects/[id]/page.tsx
2곳에 중복. 순수 헬퍼로 추출:
```ts
export function assetScanCategories(asset: Asset): string[]  // resolveCheckPlan(asset).packs의 고유 category
```
- 두 page.tsx 사용처를 이 헬퍼 호출로 교체(동작 불변).

### ② 공용 컴포넌트 — `src/app/_components/ScanCategoryButton.tsx` (신규, client)
AssetTable에 인라인인 카테고리 모달 로직을 공용 컴포넌트로 추출:
- props: `{ assetId: string; scanCategories: string[]; label: string; variant?: "primary" | "outline" }`.
- 버튼 클릭 → `Modal`(제목 "점검 카테고리 선택") + 카테고리 체크박스(기본 전체 체크), 최소 1개 → "점검 시작"
  → `POST /api/runs { assetId, categories }` → 성공 시 `router.push('/runs/{run.id}')`, 실패/409 시 에러 문구.
- 기존 `Modal` + 로컬 `CATEGORY_LABEL`(container/OS/WEB/WAS/DB) 재사용.
- `variant`로 primary(채움)/outline(테두리) 버튼 스타일 — StartScanButton/RescanButton 기존 룩 유지.
- `scanCategories`가 비어있으면(이론상 없음) 카테고리 없이 전체 점검으로 POST(방어).

### ③ 진입점 3곳 배선
- **자산 목록**(`AssetTable`): 인라인 모달·startSingleScan·scanCats·CATEGORY_LABEL 제거하고, 단일 선택 시
  `ScanCategoryButton`을 사용(행의 `scanCategories` 전달). 다중 선택은 기존 bulk 전체 유지.
- **자산 상세**(`assets/[id]/page.tsx` 서버 → `StartScanButton`): page가 `assetScanCategories(asset)` 계산해
  `<ScanCategoryButton label="점검 시작" variant="primary" assetId scanCategories />`로 교체(StartScanButton 대체).
- **리포트 재점검**(`RescanButton` in `ReportView`): `/api/runs/[id]` 응답에 `scanCategories`(서버가 run의 asset으로
  `assetScanCategories` 계산; assetId 없으면 `[]`) 추가 → ReportView가 `<ScanCategoryButton label="재스캔"
  variant="outline" assetId scanCategories />`로 교체.

## 데이터 흐름
```
자산상세: assetScanCategories(asset) → ScanCategoryButton
리포트: /api/runs/[id] → { ..., scanCategories } → ReportView → ScanCategoryButton
자산목록: AssetRowData.scanCategories(기존) → ScanCategoryButton
공통: 모달 체크 → POST /api/runs {assetId, categories} → /runs/{id}
```

## 에러/경계
- 카테고리 전부 해제 시 "점검 시작" 비활성(최소 1개).
- 409(이미 진행 중) 등 서버 에러 문구를 모달/버튼 옆에 표시.
- run의 asset이 없으면(로컬 이미지 재점검 등) scanCategories=[] → 모달 없이 전체(또는 버튼 비노출) — 기존 동작 유지.
- 플릿·로컬이미지 경로는 이번 변경과 무관(카테고리 미전달=전체).

## 테스트 전략
- **단위(`assetScanCategories`)**: 서버 자산→[OS(+벤더)], 이미지→[container,OS,WEB,WAS,DB] 고유 카테고리.
- **API(`/api/runs/[id]`)**: 응답에 `scanCategories` 포함(run의 asset 기준), asset 없으면 [].
- **UI**: ScanCategoryButton·3진입점 tsc/eslint/next build + 수동(각 진입점에서 모달·전체 점검).
- **회귀**: AssetTable 단일/다중 점검, 기존 page.tsx scanCategories.

## 다루지 않는 것
- 플릿·로컬이미지 카테고리 선택, 카테고리 프리셋 저장.
- 모달 UX 변경(기존 그대로 재사용).
