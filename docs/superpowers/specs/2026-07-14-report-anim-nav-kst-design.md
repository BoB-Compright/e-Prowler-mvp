# 리포트/CVE 애니메이션 · 숫자 필터 · 사이드바 접기 · KST 시간 설계

> 작성일: 2026-07-14
> 상태: 승인됨 → 구현 계획 대기

## 목표
데모 완성도용 5개 개선: ① CVE 피드 통계 숫자 카운트업 ② 리포트 숫자·막대 애니메이션 ③ 리포트 상단
숫자 클릭 상태 필터 ④ 좌측 사이드바 접기/펼치기 ⑤ 절대 시각 표시를 KST로.

기존 `CountUp`(useCountUp)·디자인 토큰·ThemeScript 패턴을 재사용한다.

## ① CVE 피드 통계 카운트업
- `CveFeedView`(client)의 3개 통계 숫자(수집 CVE·긴급·조치 대상)를 `<CountUp value={n} />`로 교체.

## ② 리포트 숫자·막대 애니메이션
- `ReportView`(client) 상단 4카드(Total/Pass/Fail/Review) 숫자를 `<CountUp>`로.
- `RiskSummaryBar`를 **client 컴포넌트로 전환**:
  - severity 카운트(Critical/High/Medium/Low)·status 카운트(pass/fail/review/skip) → `<CountUp>`.
  - 상태 막대 세그먼트 너비를 **마운트 후 0→목표%로 그로우**: 초기 width 0, `useEffect`로 mounted=true 뒤
    목표 width, `transition-[width] duration-500 ease-out`. `prefers-reduced-motion`이면 즉시 목표(트랜지션 없음).

## ③ 리포트 상단 숫자 클릭 필터
- 상단 4카드를 `<button>`으로: Total→`setStatusFilter("all")`, Pass→`"pass"`, Fail→`"fail"`, Review→`"review"`.
- 현재 `statusFilter`와 일치하는 카드에 활성 테두리(`border-primary`) 강조. 기존 칩 필터와 동일 상태 공유
  (하단 리스트가 즉시 필터됨). 카드에 `cursor-pointer hover:border-primary/50` 등 상호작용 힌트.

## ④ 사이드바 접기/펼치기
- 상태: localStorage `nhg_nav_collapsed`("1"/미설정) + `<html data-nav-collapsed="1">` 속성.
- `NavCollapseScript`(신규, ThemeScript 동형): 페인트 전 localStorage 읽어 `data-nav-collapsed` 설정
  (깜빡임 방지). `layout.tsx` `<head>`에 추가.
- `AppSidebar`(client): `useSyncExternalStore`로 `data-nav-collapsed` 구독(ThemeToggle 패턴). 상단에
  **접기/펼치기 토글 버튼**(chevron). 토글 시 localStorage 갱신 + 속성 토글 + 커스텀 이벤트 dispatch.
  - 접힘: 라벨 span 숨김(아이콘만), 하단 클러스터는 **로그아웃 아이콘만** 렌더(설정·도움말·다크 숨김).
  - 펼침: 현행 그대로.
- **CSS(globals.css)**: 사이드바 폭·본문 여백을 속성으로 제어(레이아웃은 서버라 CSS로).
  - `aside[data-app-sidebar]` 기본 `width:16rem`; `html[data-nav-collapsed="1"] aside[data-app-sidebar]{width:4rem}`.
  - 본문 래퍼 클래스 `.app-main`(layout.tsx div에 부여): md에서 기본 `padding-left:16rem`,
    `html[data-nav-collapsed="1"] .app-main{padding-left:4rem}`. (기존 `md:pl-64` 대체.)
  - `transition: width .2s, padding-left .2s` 부드럽게.
- **헤더 현재 탭 제목**: `AppHeader`의 `<div className="hidden text-[13px] text-muted md:block">`를
  **`font-semibold text-text`**로 약간 강조(디자인 톤 유지).
- 모바일(사이드바 `hidden md:flex`): 접기 UI는 데스크톱 전용, 모바일 영향 없음.

## ⑤ KST 시간
- 신규 `src/lib/time/kst.ts` — `formatKst(iso: string): string`:
  `Asia/Seoul` 기준 `YYYY-MM-DD HH:mm`(24h). 내부적으로 `Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",...})`
  또는 수동 조합으로 안정적 포맷.
- 절대 시각 표시 7곳의 포맷터를 `formatKst`로 교체:
  `runs/[id]/report/ReportView.tsx`, `share/[token]/ShareGate.tsx`, `cve/page.tsx`(lastScan),
  `runs/page.tsx`, `runs/batch/[batchId]/page.tsx`, `assets/[id]/page.tsx`, `assets/[id]/ScheduleForm.tsx`.
- 저장은 UTC ISO 유지(정확·이식성) — **표시만 KST**. 상대시간(relativeLabel 등) 영향 없음.
- 프로덕션 기동에 `TZ=Asia/Seoul` 부여(스케줄러·new Date 로컬 일관성; 표시는 formatKst가 담당).

## 에러/경계
- 애니메이션·카운트업은 reduced-motion 존중. 사이드바 상태는 SSR/hydration 안전(사전 스크립트로 속성
  선반영, 서버 초기 스냅샷은 펼침 기준).
- formatKst는 잘못된 ISO엔 원본 슬라이스로 폴백(방어). KST 변환은 저장값 불변.

## 테스트
- `formatKst` 단위 테스트(UTC→KST +9h, 자정/날짜경계). 리포트 필터 매핑은 순수 로직(카드→CheckStatus|"all")
  로 뽑아 단위 테스트 가능. 나머지 UI는 tsc/eslint/next build + 수동.

## 다루지 않는 것
- 타임존 사용자 설정, 저장 포맷 변경, 사이드바 상태 서버 영속화(브라우저별 localStorage로 충분),
  모바일 사이드바 접기.
