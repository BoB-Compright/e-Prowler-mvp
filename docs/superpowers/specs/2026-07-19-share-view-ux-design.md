# PM 공유 뷰 UX 개선 (내비 숨김 + 안전망 안내 + 자산 종류 그룹핑) 설계

날짜: 2026-07-19
상태: 사용자 검토 대기

## 배경 / 문제

실 ngrok 검증 후 PM 공유 뷰에서 두 가지 사용성 문제가 확인됐다.

1. **공유 뷰가 관리자 앱 셸을 그대로 물려받는다.** 루트 레이아웃(`src/app/layout.tsx`)이 모든 화면에
   `AppSidebar`(대시보드/자산관리/프로젝트/CVE피드/점검이력/카탈로그)를 렌더한다. PM에게도 이 관리자
   내비가 보이고, 누르면 공개 공유 호스트에서 proxy가 **bare 404**를 반환해 PM이 영문을 모른다.
2. **자산이 많으면 가로 스크롤이 불편하다.** `ShareGate.tsx`가 자산을 한 줄 `overflow-x-auto`로 나열해,
   자산 수가 늘면 넘겨보기 힘들다. 프로젝트 단위에서 자산 **종류**(OS/WEB/WAS/DB)는 거의 고정이고
   그 안 **개수**만 다르므로, 종류로 묶는 편이 자연스럽다.

## 결정 (사용자 확정)

- 기능 1: **공유 뷰에서 관리자 내비를 숨긴다(미니멀 공개 셸)** + 공유 외 경로 접근 시 bare 404 대신
  **안전망 안내 페이지**를 보여준다.
- 기능 2: 자산을 **종류 칩(아이콘+라벨+개수) 한 줄**로 묶고, 종류를 누르면 그 종류 자산들이 펼쳐지고,
  자산을 고르면 우측 상세 리포트가 뜬다.

## 범위

공유 뷰(`/share/*`)와 그 데이터 경로에 한정. 관리자 화면·인증·점검 로직은 변경하지 않는다.
`/login` 등 다른 공개 화면의 셸도 변경하지 않는다(공유 뷰만 분기).

---

## 기능 1: 관리자 내비 숨김 + 안전망 안내

### 1-A. 공유 뷰 미니멀 셸

- **proxy(`src/proxy.ts`)**: 요청 경로가 공유 뷰일 때 프록시-저작 헤더 `x-share-view: 1`을 세팅해
  전달한다. 정확한 조건(오매칭 방지): `pathname === "/share"` 또는 `pathname.startsWith("/share/")`
  또는 `pathname === "/share-blocked"` (즉 `/sharewolf` 같은 경로는 제외). 기존 `PUBLIC_ROUTE_HEADER`
  strip 다음, 공유 호스트 게이트와 무관하게 모든 호스트에서 동일하게 세팅한다.
- **루트 레이아웃(`src/app/layout.tsx`)**: 이미 `headers()`를 읽어 `isPublicRoute`를 계산한다. 여기에
  `const isShareView = requestHeaders.get("x-share-view") === "1"` 를 추가한다. `isShareView`이면
  `AppSidebar`와 관리자 `AppHeader` 대신 **미니멀 공개 셸**을 렌더한다:
  - 사이드바 없음. 상단에 NH-Guardian 브랜드 바(로고 + "AI 상시 보안 점검 체계" 서브텍스트)만.
  - 본문 컬럼은 `md:pl-64`(사이드바 폭 오프셋) 없이 전체 폭.
  - `CveLiveToasts`는 공유 뷰에서 렌더하지 않음(이미 `!isPublicRoute` 가드라 공유 뷰 제외됨 — 유지).
- 관리자 화면(`isShareView` false)은 기존 셸 그대로.

### 1-B. 안전망 안내 페이지 (`/share-blocked`)

- **신규 공개 페이지 `src/app/share-blocked/page.tsx`**: 중앙 정렬 카드로
  "이 링크는 공유된 점검 리포트 열람 전용입니다"와 "요청하신 페이지는 접근 권한이 없습니다"를 표시.
  로그인 폼·관리자 내용·내비 없음(미니멀 공개 셸 안에서 렌더). 정적 페이지.
- **proxy 변경**: 공개 공유 호스트에서 공유 외 경로일 때(현재 `new NextResponse(null,{status:404})`)
  대신 `NextResponse.rewrite(new URL("/share-blocked", request.url), { status: 404 })` 로 바꾼다.
  - rewrite로 `/share-blocked` 페이지 내용을 렌더하되 HTTP 상태는 404 유지(존재 은폐 + 친절한 본문).
  - `/share-blocked`가 공유 호스트에서 렌더되려면 공개 경로여야 한다: `isPublicPath`(`constants.ts`)와
    `isAllowedShareOnlyPath`(`shareUrl.ts`)에 `/share-blocked`를 허용으로 추가한다.
  - 또한 이 페이지도 미니멀 공개 셸이어야 하므로, proxy가 `/share-blocked`에도 `x-share-view: 1`을
    세팅한다(1-A의 조건을 `/share` 또는 `/share-blocked`로 확장).

### 보안 메모

- 로그인 폼·내부 API·관리자 화면은 여전히 도달 불가(rewrite 대상이 안내 페이지뿐). 핵심 은폐 유지.
- "공유 전용 배포"라는 사실은 안내 페이지로 드러나지만, 공유 URL 소지자는 이미 아는 정보라 실질
  위험이 낮다(사용자가 사용성을 우선하기로 결정). 상태코드는 404를 유지해 라우트 존재 자체는 안 알린다.

---

## 기능 2: 자산 종류별 그룹핑 선택

### 2-A. 데이터: 공유 API에 kind 추가

- **`src/app/api/share/[token]/route.ts`**: `publicAssets` 매핑에 `kind: classifyAssetKind(asset)`를
  추가한다(`@/lib/assets/kind`의 기존 함수 — category 우선, 없으면 이름 추론). 기존 필드
  (`id`,`displayName`,`type`,`verdict`)는 유지.

### 2-B. 순수 그룹핑 로직 (신규, 테스트 대상)

- **신규 `src/lib/assets/groupByKind.ts`**: `groupAssetsByKind(assets)` 를 둔다.
  - 입력: `{ id, displayName, verdict, kind }[]` (최소 필드).
  - 출력: 종류 순서(OS→WEB→WAS→DB→기타) 고정으로, 자산이 하나라도 있는 종류만
    `{ kind, label, assets }[]` 배열로 반환(빈 종류 제외). `label`은 `ASSET_KIND_LABEL[kind]`.
  - 각 그룹 내 자산 순서는 입력 순서 유지.
- 순수 함수라 유닛 테스트가 쉽다(빈 배열, 단일 종류, 다종류, 순서/개수).

### 2-C. UI: ShareGate 선택부 교체

`ShareGate.tsx`의 자산 목록(현재 `overflow-x-auto` 한 줄, 위 "교체 대상" 블록)을 2단 선택으로 교체:

- **상단 종류 칩 한 줄**: `groupAssetsByKind(data.assets)` 결과를 칩으로. 각 칩 = KindIcon(기존
  `AssetKindBadge`의 아이콘 재사용) + 라벨 + 개수(예 `DB 3`). 종류 수가 적어 가로 스크롤 불필요
  (`flex flex-wrap`).
- **선택된 종류의 자산 칩**: 그 아래 줄에 해당 종류 자산들을 칩으로 펼침(자산명 + 판정 배지).
  선택된 자산은 강조.
- **상세**: 선택된 자산의 기존 `ShareReport`(우측/하단) 그대로.
- **상태/초기값**: `selectedKind`, `selectedAssetId`. 로드 시 첫 그룹의 kind + 그 그룹 첫 자산 자동 선택.
  종류를 바꾸면 그 종류의 첫 자산을 자동 선택.
- 자산 0개일 때 기존 "등록된 자산이 없습니다" 카드 유지.

---

## 데이터 흐름

1. PM이 공유 링크 접속 → proxy가 `x-share-view` 세팅 → 레이아웃이 미니멀 셸 렌더(내비 없음).
2. 비밀번호 통과 → 공유 API가 자산별 `kind` 포함 응답 → ShareGate가 종류로 그룹핑해 칩 렌더.
3. PM이 종류 → 자산 선택 → 기존 ShareReport로 상세.
4. (예외) 공유 외 경로 직접 접근 → proxy가 `/share-blocked`로 rewrite(404) → 친절한 안내.

## 테스트

- `groupByKind.test.ts`: 빈 배열→[], 단일/다종류 그룹핑, 종류 순서(OS→…→기타), 빈 종류 제외,
  그룹 내 자산 순서 유지, 개수 정확성.
- `proxy.test.ts` 보강: 공유 호스트 블록 경로 → `/share-blocked`로 rewrite되고 상태 404.
  `/share-blocked` 자체는 공유 호스트에서 통과(허용 경로). 기존 게이트 케이스 회귀 없음.
- 공유 API: 응답 자산에 `kind` 포함(라우트 테스트가 있으면 보강, 없으면 최소 검증).
- 실 검증(ngrok): 공유 뷰에 관리자 내비 안 보임 / 종류 칩→자산→리포트 동작 / 공유 외 경로 안내 페이지.

## 범위 외

- 관리자 화면·`/login` 셸 변경, 자산 종류 재분류 규칙 변경, 공유 뷰 신규 데이터 노출(현재 노출 정책 유지).
- 종류별 요약 통계(종류별 취약 개수 등)는 이번 범위 아님(칩의 개수 배지까지만).
