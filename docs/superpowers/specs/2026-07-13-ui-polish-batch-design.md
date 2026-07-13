# 앱 셸 & 대시보드 UI 폴리시 배치 설계

> 작성일: 2026-07-13
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
데모 완성도를 위한 5개 UI 개선: (①) 대시보드 진입 애니메이션, (②) 브랜드 보조문구,
(③) 다크 토글 아이콘화, (④) 사이드바 하단 유틸 아이콘 + /settings, (⑤) 온보딩 첫 로그인 자동 + 순서
재편·신규 반영.

## 확정 결정
- ② 보조문구 = **"AI 상시 보안 점검 체계"**.
- ④ 설정 아이콘 → 신규 **`/settings`** 페이지로 **AI 분석 토글 이전**(대시보드 헤더에서 제거).
- ⑤ 온보딩 done-key를 **버전업(`nhg_onboarding_done_v2`)** → 기존 열람자도 업데이트된 투어 1회 자동.

## ① 대시보드 진입 애니메이션 (CSS 전용)
- `globals.css`에 keyframes 추가, `prefers-reduced-motion: reduce`면 비활성. 클라이언트 변환 불필요.
- **게이지**(`SecurityScoreGauge`): 컬러 아크 `<path>`에 `pathLength={1}` 부여 + `stroke-dasharray:1;
  stroke-dashoffset:1→0` draw-on 애니메이션(~0.9s ease-out). 배경 아크는 정적.
- **도넛**(`AssetStatusDonut`): `<svg>` 그룹을 `transform-origin:center`로 **rotate(-90°→0)+scale(0.85→1)
  +opacity(0→1)**(~0.7s ease-out) — 펼치는 느낌.
- 두 컴포넌트는 서버 컴포넌트 유지(클래스만 부여). 대시보드 최초 마운트 시 재생.

## ② 브랜드 보조문구
- `BrandLogo`의 `subtext` "자산 보안 점검" → **"AI 상시 보안 점검 체계"**.
- `AppHeader`의 기본 문구 fallback "NH-Guardian"은 유지(현재 페이지 라벨 표시 로직 그대로).

## ③ 다크 토글 아이콘화
- `ThemeToggle`: 텍스트("다크/라이트") → **해/달 SVG 아이콘 버튼**(라이트일 때 달, 다크일 때 해).
  기존 아이콘버튼 스타일(`rounded-lg border border-border ... hover:bg-bg`) 유지, `aria-label`
  "다크 모드로 전환"/"라이트 모드로 전환"로 접근성 확보.

## ④ 사이드바 하단 유틸 클러스터 + /settings
- `AppSidebar`: `nav`가 `flex-1`로 밀어 **하단 고정 클러스터** 추가 — **설정·도움말·다크모드·로그아웃**
  아이콘 버튼 한 줄. 각 `aria-label`·title 제공.
  - 설정 → `/settings` 링크. 도움말 → 기존 온보딩 강제 실행(`HelpButton`의 force 로직 재사용). 다크모드
    → `ThemeToggle`(③). 로그아웃 → `AppHeader`의 logout fetch 로직을 공용 함수/컴포넌트로 추출해 재사용.
- **신규 `/settings` 페이지**(`src/app/settings/page.tsx`): 카드에 **AI 분석 토글**(대시보드에서 이전)
  + 앱 정보(간단). 서버에서 `getAiAnalysisEnabled()` 초기값 전달. 기존 `AiAnalysisToggle` 컴포넌트 재사용.
- **대시보드 헤더에서 AI 토글 제거**(page.tsx의 AiAnalysisToggle·import 제거, 헤더 우측은 "자산 등록"만).
- **데스크톱**: 사이드바 하단이 유틸 담당 → `AppHeader`에서 도움말·로그아웃·테마 **중복 제거**, 헤더는
  페이지 라벨 + 사용자만. **모바일**(사이드바 `hidden md:flex`): 헤더에 유틸(도움말·테마·로그아웃) 유지.
  - 구현: 헤더의 유틸 묶음을 `md:hidden`으로 감싸 모바일 전용, 사이드바 하단 클러스터는 `hidden md:flex`
    (사이드바 자체가 이미 `md:flex`라 자연히 데스크톱 전용).

## ⑤ 온보딩 첫 로그인 자동 + 순서 재편 + 신규 반영
- **자동 시작 조건**(`shouldAutoStart`): 기존 "자산 0개 && 미열람" → **"미열람이면 무조건"**(assetCount
  조건 제거). done-key를 `nhg_onboarding_done_v2`로 올려 기존 열람자도 1회 재노출. `OnboardingTour`의
  `assetCount` prop은 유지(호출부 영향 최소)하되 `shouldAutoStart(seen)` 시그니처로 단순화.
- **순서(실 사용 흐름) + 신규 스텝**:
  1. 환영(center)
  2. 자산 등록(anchor asset-register)
  3. 점검 실행(anchor nav-projects, preview scan)
  4. 점검 진행(anchor nav-runs, preview progress)
  5. 분석 보고서(anchor nav-dashboard, preview results) — 취약·CVE·AI 근거/조치
  6. **AI 분석(신규, anchor nav-settings)** — 설정에서 AI 분석 on/off, 점검 시 판정·근거 생성
  7. **CVE 피드·실시간 대응(신규, anchor nav-cve)** — NVD 수집·자산 매칭·조치 대상, 우하단 라이브 토스트
  8. PM 공유(anchor nav-projects, preview share)
  9. 완료(center, CTA 자산 등록)
- 신규 스텝 앵커: 사이드바 nav의 CVE 피드(`nav-cve`)·설정(`nav-settings`)에 `data-tour` 부여(navItems·
  사이드바). AI 분석 스텝은 설정 nav를 가리킴(토글이 /settings로 이전됐으므로).

## 데이터/상태
- 새 서버 상태 없음. AI 토글은 기존 `app_settings.ai_analysis_enabled` 그대로(위치만 /settings로).
- 온보딩은 localStorage 키만 변경.

## 에러/경계
- 애니메이션은 reduced-motion 존중. /settings는 인증 필요(레이아웃 게이트가 이미 처리).
- 사이드바 하단 클러스터는 데스크톱 전용, 모바일은 헤더 유틸 유지 → 어느 뷰에서도 로그아웃·도움말·테마
  접근 가능.

## 테스트 전략
- `shouldAutoStart`·`ONBOARDING_STEPS` 순서/신규 스텝은 단위 테스트(steps.test 있으면 갱신, 없으면 추가).
- 나머지(애니메이션·아이콘·사이드바·/settings·헤더 분기)는 컴포넌트 테스트 인프라 없음 → tsc/eslint/
  next build + 수동 확인.

## 다루지 않는 것
- 신규 설정 항목(테마 외), 온보딩 콘텐츠 A/B, 애니메이션 라이브러리 도입, 헤더/사이드바 구조 재설계(추가만).
