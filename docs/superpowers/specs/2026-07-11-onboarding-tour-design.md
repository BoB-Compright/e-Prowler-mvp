# 첫 사용자 온보딩 코치마크 투어 설계

날짜: 2026-07-11
상태: 승인됨

## 배경 / 문제

첫 사용자가 로그인하면 빈 대시보드만 보이고, "자산 등록 → 프로젝트로 묶기 → 전체 점검 → 분석 결과 확인"이라는 핵심 흐름을 어디서 시작하는지 알기 어렵다. 실제 화면 위에서 각 단계의 위치를 짚어 주는 안내가 필요하다.

## 목표

- 첫 방문(자산 0개) 시 자동으로 뜨는 안내형 코치마크 투어로, 자산 등록부터 분석 결과 확인까지의 위치를 단계별로 안내한다.
- 한 번 보면(완료/건너뛰기) 다시 자동으로 뜨지 않고, 원할 때 헤더 버튼으로 재실행할 수 있다.
- 백엔드·DB 변경 없이 프론트엔드만으로 구현한다.

## 비목표

- 액션 완료를 감지해 다음으로 넘기는 게이트형 투어(대기·상태 감지) — 이번 범위 아님(안내형만).
- 계정 기준 크로스-디바이스 기억(DB 플래그) — localStorage(브라우저별)로 충분.
- 실제 페이지를 순차 이동하는 멀티페이지 워크스루 — 대시보드 단일 화면에 앵커를 두고, 사이드바/헤더/대시보드 요소를 가리킨다.

## 동작

### 트리거
- 대시보드(`/`) 진입 시, **자산 0개 AND `localStorage["nhg_onboarding_done"]` 미설정**이면 투어 자동 시작.
- 순수 함수 `shouldAutoStart(assetCount: number, seen: boolean): boolean` = `assetCount === 0 && !seen`.

### 기억
- 완료(마지막 스텝의 닫기) 또는 건너뛰기 시 `localStorage.setItem("nhg_onboarding_done", "1")`.
- 재방문 시 자동으로 뜨지 않음.

### 재실행
- `AppHeader`에 **[도움말]** 버튼. 클릭 시:
  - 현재 대시보드가 아니면 `/`로 이동하고,
  - `sessionStorage["nhg_onboarding_force"] = "1"`을 세팅해 대시보드의 투어가 자산 수·done 플래그와 무관하게 시작하도록 한다.
  - 투어 시작 시 이 force 플래그는 소비(삭제)한다.

## 투어 방식 (안내형 코치마크)

- 전체 화면을 반투명 딤(dim)으로 덮고, 대상 요소 영역만 밝게 뚫는 **스포트라이트** + 그 옆(자동 배치)에 **말풍선**(제목·본문·[이전]/[다음 또는 완료]/[건너뛰기]).
- 대상 요소는 `data-tour="<key>"` 속성으로 찾는다. **요소가 없으면(예: 모바일에서 사이드바 숨김) 그 스텝은 화면 중앙 말풍선으로 폴백**(스포트라이트 없음).
- 사용자가 자기 페이스로 [다음]을 눌러 진행한다. 실제 액션 수행을 기다리지 않는다.
- 키보드: `Esc` = 건너뛰기, `←/→` = 이전/다음(선택적, 구현 단순하면 포함).
- 스포트라이트는 대상 요소의 `getBoundingClientRect()`로 위치를 잡고, 리사이즈/스크롤 시 재계산한다.

## 스텝 정의 (6단계)

`src/lib/onboarding/steps.ts`의 `ONBOARDING_STEPS` 배열(순수 데이터):

| # | anchor (data-tour) | 제목 | 본문 | placement |
|---|---|---|---|---|
| 1 | (없음, 중앙) | 환영합니다 | NH-Guardian에 오신 걸 환영합니다. 3단계로 첫 점검을 안내할게요. | center |
| 2 | `asset-register` | ① 자산 등록 | 점검할 서버·레포를 등록하세요. 엑셀 업로드로 여러 개를 한 번에 올릴 수 있어요. | auto |
| 3 | `nav-assets` | ② 프로젝트로 묶고 점검 | 자산을 프로젝트로 묶고, 체크박스로 선택해 일괄 점검하거나 프로젝트에서 전체(Fleet) 점검을 실행하세요. | auto |
| 4 | `nav-runs` | ③ 점검 진행 | 점검이 시작되면 단계·진행률이 실시간으로 표시됩니다. | auto |
| 5 | `dashboard-score` | ④ 분석 결과 | 완료되면 대시보드 점수·활동 피드에 반영되고, 각 점검 리포트에서 취약 항목·CVE·AI 분석 상세를 봅니다. | auto |
| 6 | (없음, 중앙) | 준비됐습니다 | 첫 자산을 등록해 시작해 보세요. | center + CTA "자산 등록하기"(→ /assets/new) |

- `StepData` 타입: `{ key: string; anchor: string | null; title: string; body: string; placement: "center" | "auto"; cta?: { label: string; href: string } }`.
- 스텝 목록 무결성 규칙(테스트): key 유일, 최소 1개, center 스텝은 anchor null, 6개 순서 고정.

## data-tour 앵커 위치

- 대시보드 헤더의 `자산 등록` 링크(`src/app/page.tsx`) → `data-tour="asset-register"`
- 대시보드 종합 보안 점수 카드(`src/app/page.tsx`) → `data-tour="dashboard-score"`
- 사이드바 내비의 `자산 관리` 항목(`src/app/_components/AppSidebar.tsx`) → `data-tour="nav-assets"`
- 사이드바 내비의 `점검 이력` 항목 → `data-tour="nav-runs"`

앵커가 여러 곳에 중복될 수 있으면 `document.querySelector('[data-tour="..."]')`로 첫 요소를 쓴다.

## 구성 요소 (파일)

- `src/lib/onboarding/steps.ts` — `StepData` 타입, `ONBOARDING_STEPS`, `shouldAutoStart()`. 순수·클라이언트 안전. **단위 테스트.**
- `src/app/_components/onboarding/OnboardingTour.tsx` (client) — props `{ assetCount: number }`. 마운트 시 자동 시작 판단(shouldAutoStart 또는 force 플래그), 스포트라이트+말풍선 렌더, localStorage 기록, 키보드 처리.
- `src/app/_components/onboarding/HelpButton.tsx` (client) — 헤더 [도움말] 버튼.
- `src/app/page.tsx` — `<OnboardingTour assetCount={assets.length} />` 마운트 + `data-tour` 속성 부여.
- `src/app/_components/AppHeader.tsx` — `<HelpButton />` 추가.
- `src/app/_components/AppSidebar.tsx` — 내비 항목에 `data-tour` 속성 부여.

## 에러/엣지 케이스

- 앵커 요소가 DOM에 없음 → 중앙 말풍선 폴백(스포트라이트 생략), 투어 계속 진행.
- 자산이 이미 있음(assetCount>0) + done 미설정 → 자동으로 안 뜸(첫 사용자 기준). [도움말]로만 실행.
- SSR: OnboardingTour는 client 컴포넌트이며 localStorage/DOM 접근은 `useEffect`(마운트 후)에서만 → 하이드레이션 불일치 없음.
- 딤 오버레이는 `role="dialog"` + `aria-modal`, 말풍선에 제목 연결(aria-labelledby), 포커스는 말풍선으로 이동.

## 테스트 전략

- 단위: `shouldAutoStart`(assetCount·seen 조합), `ONBOARDING_STEPS` 무결성(순서·key 유일·center anchor null·cta 존재).
- 실물: 자산 0 상태에서 대시보드 진입 시 자동 시작, [다음]으로 6단계 진행, 앵커 스포트라이트 위치, 건너뛰기/Esc, 완료 후 재방문 시 미표시, [도움말] 재실행, 모바일 폭에서 중앙 폴백.

## 진행 순서

steps.ts(+테스트) → OnboardingTour → HelpButton → 페이지·헤더·사이드바 배선 → 실물 검증.
