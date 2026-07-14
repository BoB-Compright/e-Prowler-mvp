# 프로젝트 삭제 + 프로젝트 탭 UX 통합 설계

> 작성일: 2026-07-14
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
(1) 프로젝트를 리스트에서 바로 삭제(테스트 프로젝트 정리). (2) 상시 노출된 생성 폼·별도 검색 박스로 분절돼
보이는 프로젝트 탭을 **툴바(검색 + 새 프로젝트 버튼) + 모달 생성 + 바로 아래 리스트**로 매끄럽게 통합한다.
기존 디자인 가이드/토큰 기반.

## 확정 결정
- **레이아웃 = 툴바 + 모달 생성**: 한 줄 툴바(좌 검색, 우 `+ 새 프로젝트`), 버튼 클릭 시 모달에 생성 폼.
  리스트가 화면 앞에 온다.
- **삭제 = 카드 ⋯ 메뉴 + 확인 다이얼로그**. 소속 자산은 **삭제하지 않고 연결만 해제**(기존 `deleteProject` 동작).
- 기존 검색(이름, 디바운스·URL 동기)·카드/배지 표현은 그대로 유지.

## 현황(이미 존재하는 것)
- `deleteProject(id)`(store): 트랜잭션으로 `UPDATE assets SET project_id=NULL` 후 `DELETE FROM projects`.
- `DELETE /api/projects/[id]`(route): `requireApiSession` 게이팅 후 `deleteProject`. **이미 구현됨.**
- 즉 삭제 백엔드는 대부분 완비 — 이 작업은 (a) store 견고성 보강, (b) 삭제 UI, (c) 탭 UX 통합.

## 아키텍처

### ① 삭제 store 견고성 보강 — `src/lib/projects/store.ts`
`scan_batches.project_id`도 `projects(id)`를 FK 참조한다. 플릿 점검 이력(scan_batches)이 있는 프로젝트를
삭제하면 `DELETE FROM projects`가 FK 위반으로 실패할 수 있다. `deleteProject` 트랜잭션에 다음을 추가:
```ts
db.prepare(`UPDATE scan_batches SET project_id = NULL WHERE project_id = ?`).run(id);
```
(assets NULL 처리와 DELETE 사이. 자산과 동일하게 배치 이력은 보존하되 프로젝트 연결만 해제.)

### ② 경량 모달 — `src/app/_components/Modal.tsx` (신규)
기존에 재사용 가능한 dialog 컴포넌트가 없다(온보딩 전용만 존재). 디자인 토큰 기반 경량 모달을 만든다:
- props: `open: boolean`, `onClose: () => void`, `title?: ReactNode`, `children`.
- 오버레이 `fixed inset-0 bg-black/40`, 가운데 패널(기존 Card 톤: `rounded-2xl border border-border bg-surface`),
  `role="dialog"`, `aria-modal`, ESC 키·오버레이 클릭·✖ 버튼으로 `onClose`. `open`이 false면 렌더 안 함.
- 생성 폼·삭제 확인 다이얼로그가 공용으로 사용.

### ③ 툴바 + 생성 모달 — `src/app/projects/ProjectsToolbar.tsx` (신규, client)
- 한 줄 flex: 좌측 검색 입력(기존 `ProjectSearch`의 디바운스·URL 동기 로직 재사용 — 컴포넌트를 그대로 배치),
  우측 `+ 새 프로젝트`(primary 버튼).
- 버튼 클릭 → `Modal`에 기존 `ProjectForm`. 생성 성공 시 모달 닫고 `router.refresh()`.
  (`ProjectForm`에 `onSuccess?: () => void` 콜백 추가 — 성공 시 모달 닫기용. 기존 단독 사용처가 없으면 이 폼은
  모달 전용이 된다.)

### ④ 카드 삭제 메뉴 — `src/app/projects/ProjectCardMenu.tsx` (신규, client)
- props: `projectId`, `projectName`, `assetCount`.
- 카드 우상단 `⋯` 버튼 → 작은 팝오버(또는 바로 삭제 다이얼로그 오픈). "삭제" 선택 → `Modal` 확인
  다이얼로그: 문구 "'{projectName}' 프로젝트를 삭제할까요? 소속 자산 {assetCount}개는 삭제되지 않고 연결만
  해제됩니다." + [취소]/[삭제](fail 색). [삭제] → `fetch(DELETE /api/projects/{id})` → 성공 시
  `router.refresh()`.

### ⑤ page.tsx 통합 — `src/app/projects/page.tsx`
- 기존 "새 프로젝트" Card + 별도 검색 박스 블록 제거 → 헤더 아래 `<ProjectsToolbar />` 한 줄.
- 프로젝트 카드의 `action`(현재 "자산 N") 영역 또는 우상단에 `<ProjectCardMenu ... assetCount={projectAssets.length} />`
  추가(자산 수 표시는 유지). 그리드는 그대로.

## 데이터 흐름
```
[검색] ProjectSearch → URL q → page.tsx listProjects+필터 (기존)
[생성] + 버튼 → Modal + ProjectForm → POST /api/projects → onSuccess: 모달 닫기 + refresh
[삭제] 카드 ⋯ → 확인 Modal → DELETE /api/projects/[id] → deleteProject(assets·scan_batches NULL) → refresh
```

## 에러/경계
- 삭제 확인 다이얼로그 없이 즉시 삭제 금지(항상 확인).
- DELETE 실패 시 다이얼로그에 에러 문구, 목록 불변.
- 모달 열린 중 ESC/배경 클릭으로 닫힘, 포커스 트랩은 과하지 않게(최소 ESC+오버레이).
- 자산 있는 프로젝트 삭제 → 자산 보존(연결 해제), 확인 문구에 개수 명시.
- scan_batches 있는 프로젝트 삭제 → FK 오류 없이 삭제(보강된 store).

## 테스트 전략
- **단위(`deleteProject`)**: 자산·scan_batches가 있는 프로젝트 삭제 시 둘 다 project_id NULL 처리되고 프로젝트가
  삭제되며 자산·배치 행 자체는 남는지. (FK ON 상태에서 오류 없이.)
- **API**: `DELETE /api/projects/[id]` 인증 게이팅(기존)·정상 삭제 경로는 기존 동작 회귀 확인(핸들러 이미 존재).
- **UI**: 툴바·모달 생성·⋯ 삭제 확인 흐름은 tsc/eslint/next build + 수동(모달 열고닫기·삭제·생성 후 refresh).

## 다루지 않는 것
- 프로젝트 일괄 삭제, 삭제 undo, 자산 동반 삭제(연결 해제만).
- 검색 고도화(현행 이름 검색 유지), 정렬/필터 추가.
- 포커스 트랩·접근성 고급 처리(ESC+오버레이 닫기 수준).
