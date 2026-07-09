# Stitch "Kinetic Security System" 전체 리스킨 설계

날짜: 2026-07-09
상태: 사용자 검토 대기

## 1. 목표

Stitch 프로젝트 **"Integrated Security Asset Dashboard"** (`projects/936621672799851412`)에서 디자인한
화면·디자인 시스템("Kinetic Security System")을 현재 Next.js 앱(e-Prowler)에 전체 이식한다.

- **범위**: 전체 리스킨 — 디자인 토큰 교체 + 앱 셸 전환 + 전 화면 개편
- **다크모드**: Kinetic 토큰에서 다크 팔레트를 파생해 기존 테마 토글 유지
- **기준 버전**: 중복 화면은 최신/강화 버전 (점검 현황 = "AI 효과 강화", 리포트 = "통합 디자인", 대시보드 = 16c0 국문 렌더 버전)
- **불변 조건**: 기능·데이터 바인딩·API·서버 컴포넌트 로직은 변경하지 않는다. 순수 UI 리스킨이다.

## 2. 기준 자료

참고 HTML은 `design_handoff_stitch/`에 보존했다 (Stitch에서 다운로드한 정적 목업, CDN Tailwind 기반).

| 파일 | Stitch 화면 | 대상 라우트 |
|---|---|---|
| `dashboard_16c0.html` | NH-Guardian 대시보드 (국문, 최종) | `/` |
| `assets_list.html` | 자산 관리 목록 | `/assets` |
| `asset_detail_ko.html` | NH-Guardian 자산 상세 (국문) | `/assets/[id]` |
| `asset_new.html` | 신규 자산 등록 | `/assets/new` (+ `/assets/upload` 폼 스타일 준용) |
| `runs_ai.html` | 점검 진행 현황 (AI 효과 강화) | `/runs/[id]` (+ `/runs`, `/runs/batch/[batchId]` 목록 스타일 준용) |
| `report_integrated.html` | 상세 점검 리포트 (통합 디자인) | `/runs/[id]/report` |
| `catalog.html` | 보안 점검 카탈로그 | `/catalog` |
| `projects.html` | 프로젝트 관리 | `/projects` |
| `projects_share.html` | 프로젝트 관리 - 공유 설정 고도화 | `/projects/[id]` |
| `share_links.html` | 공유 링크 관리 및 비밀번호 재설정 | `/projects/[id]` 공유 패널 (`ShareLinkPanel`) |
| `share_pm_view.html` | 프로젝트 공유 뷰 (PM용) | `/share/[token]` |

`dashboard_d923.html`은 16c0과 내용이 동일한 중간본 — 참고용으로만 보존, 기준 아님.

## 3. 디자인 토큰 (Phase 1)

`src/app/globals.css`의 CSS 변수 **이름은 유지**하고 값만 Kinetic으로 교체한다.
변수명이 유지되므로 기존 컴포넌트는 깨지지 않고 즉시 새 톤이 적용된다.

### 라이트 (Kinetic 원본)

| 변수 | 현재 (Coinbase) | 변경 (Kinetic) | 근거 |
|---|---|---|---|
| `--color-primary` | `#0052ff` | `#0052ff` (유지) | Kinetic primary-container와 동일 |
| `--color-secondary` | `#0ea5e9` | `#4c5e85` | Kinetic secondary |
| `--color-pass` | `#05b169` | `#00c076` | Kinetic tertiary override (Success Green) |
| `--color-fail` | `#cf202f` | `#ba1a1a` | Kinetic error |
| `--color-review` | `#f4b000` | `#f4b000` (유지) | Kinetic에 amber 토큰 없음, 브랜드 문서의 Warning Amber 역할 |
| `--color-neutral` | `#a8acb3` | `#9ba6b5` | 브랜드 문서 Tertiary/Disabled Text |
| `--color-bg` | `#ffffff` | `#f8f9ff` | Kinetic surface (캔버스가 쿨톤, 카드가 흰색인 구조로 반전) |
| `--color-surface` | `#f7f7f7` | `#ffffff` | Kinetic surface-container-lowest (카드/컨테이너) |
| `--color-border` | `#dee1e6` | `#c3c5d9` | Kinetic outline-variant |
| `--color-text` | `#0a0b0d` | `#0e1d2b` | Kinetic on-surface |
| `--color-muted` | `#7c828a` | `#697789` | 브랜드 문서 Secondary Text |

### 다크 (파생)

Stitch 목업 자체에 포함된 `dark:` 클래스(inverse-surface 계열)를 파생 기준으로 삼는다.

| 변수 | 다크 값 | 근거 |
|---|---|---|
| `--color-bg` | `#0e1d2b` | on-surface 반전 (가장 어두운 캔버스) |
| `--color-surface` | `#243141` | Kinetic inverse-surface (카드) |
| `--color-border` | `rgba(233,241,255,0.14)` | inverse-on-surface 14% (기존 방식 준용) |
| `--color-text` | `#e9f1ff` | Kinetic inverse-on-surface |
| `--color-muted` | `#8fa3c0` | inverse-on-surface를 채도 유지한 채 감쇠 |
| 상태색 4종 | 라이트와 동일 유지 | 어두운 배경 대비 충분 |

### 형태·타이포

- `--radius-nh`: `24px` → **`8px`** (Kinetic Standard). 대형 위젯 래퍼는 개별적으로 `16px`(`rounded-2xl`) 사용.
- **배지 전용**: pill(`rounded-full`) — StatusBadge 컴포넌트에서 직접 지정.
- `--font-sans`: Inter 유지 (Kinetic도 Inter).
- `--font-mono`: `Consolas` → **JetBrains Mono** (`next/font/google`으로 로드, 자산 ID·IP·경로·코드에 사용).
- 그림자: 카드에는 사용하지 않고 1px 보더로 경계 표현. 호버 lift `0 4px 12px rgba(0,0,0,0.05)`, 모달/드로어 `0 12px 32px rgba(0,0,0,0.1)`만 허용.

### 아이콘

Stitch 목업은 Material Symbols 폰트를 CDN으로 쓴다. CDN 의존을 피하기 위해 **기존 인라인 SVG 방식을 유지**하고,
새로 필요한 아이콘만 Material Symbols 모양을 본뜬 SVG로 추가한다.

## 4. 앱 셸 전환 (Phase 2)

가장 큰 구조 변경. 현재 파란 상단 헤더 단일 셸 → Stitch의 **고정 좌측 사이드바 + 상단 유틸 헤더** 셸.

- `src/app/_components/AppSidebar.tsx` (신규, client): 고정 `w-64`, 로고("NH-Guardian" 워드마크 + e-Prowler 서브텍스트), 내비 5항목(대시보드/자산 관리/프로젝트/점검 이력/카탈로그 — 현재 `TABS`와 동일 라우트), 활성 항목은 primary 배경 처리. `md` 미만에서는 숨김.
- `AppHeader.tsx` (개편): 흰 배경 `h-16` 유틸 바 — 페이지 브레드크럼 영역 + 우측에 ThemeToggle. 내비 기능은 사이드바로 이동. 모바일(`md` 미만)에서는 내비 링크를 헤더에 가로 스크롤로 노출(기존 동작 보존).
- `layout.tsx`: `body`를 `flex` 행 구조로 — 사이드바 + (`md:pl-64`) 본문 컬럼(헤더 + children).
- 각 페이지의 최상위 컨테이너 패딩/최대폭을 Kinetic 그리드(데스크톱 32px 마진, max 1440px)로 통일.

## 5. 공용 컴포넌트 (Phase 3)

개편 중 반복 요소만 추출한다 (선제적 라이브러리 구축은 하지 않음):

- `StatusBadge`: pill, 저채도 배경(10% opacity) + 고대비 동일 색 텍스트. 상태 4종(pass/fail/review/neutral) + severity 변형.
- `Card`: 흰 서피스 + 1px `--color-border` + `rounded-lg(8px)`/대형 `rounded-2xl(16px)`. 헤더 슬롯(제목 + 우측 액션).
- `SectionLabel`: label-caps 스타일(12px/700/0.05em, muted) — 테이블 헤더·섹션 오버라인 공용.
- 데이터 테이블 규칙: 헤더 label-caps, 줄무늬 없음, 1px 가로 디바이더, 행 호버 `--color-bg` 필.
- 기존 `RiskSummaryBar` 등은 토큰을 이미 참조하므로 스타일 미세 조정만.

## 6. 화면별 개편 (Phase 4)

노출 빈도순으로 진행하며, 각 화면은 독립 커밋 단위:

1. `/` 대시보드 — KPI 스탯 타일 4개(전체 자산/고위험/점검 진행/완료), 자산 보안 상태, 고위험 CVE TOP 5, 최근 활동 피드, 로컬 이미지 스캔 폴백 섹션. 목업 구성이 현재 페이지 구성과 동일하므로 레이아웃·스타일 개편 중심.
2. `/assets`, `/assets/[id]`, `/assets/new` (+ upload 폼 스타일 준용)
3. `/runs/[id]` 점검 진행 현황(AI 강화 버전: 단계 타임라인·로그 영역), `/runs`, `/runs/batch/[batchId]`
4. `/runs/[id]/report` 통합 리포트
5. `/catalog`
6. `/projects`, `/projects/[id]`(공유 설정 + 링크 관리 패널)
7. `/share/[token]` PM용 공유 뷰

각 화면 작업 규칙:

- 목업 HTML은 **레이아웃·클래스 참고 자료**다. 마크업을 복붙하지 않고 기존 TSX의 데이터 바인딩 위에 스타일을 다시 입힌다.
- 목업에만 있고 실제 데이터가 없는 요소(가짜 지표, 장식용 트렌드 화살표 등)는 **넣지 않는다**. 실데이터가 있는 요소만 구현.
- 목업에 없지만 현재 화면에 있는 기능 요소(버튼·폼·폴링 상태 등)는 Kinetic 스타일로 감싸서 **전부 유지**.
- Stitch의 `sm/md/lg/xl` 스페이싱은 Tailwind 기본 스케일(8/16/24/32px)로 환산해 적용.

## 7. 검증

- 기존 vitest 테스트 전체 통과 유지 (`npm test`) — 로직 무변경이므로 실패 시 회귀 신호.
- 화면별로 dev 서버에서 라이트/다크 각각 육안 확인 (기준: Stitch 스크린샷).
- `npm run lint` / `npm run build` 통과.

## 8. 범위 외 (명시적 제외)

- 기능 추가·변경 없음 (Stitch 목업에만 존재하는 알림·설정 아이콘 등 미구현 기능은 넣지 않음).
- 모바일 전용 화면 신규 설계 없음 — 기존 반응형 수준 유지.
- Material Symbols 폰트 도입 없음 (인라인 SVG 유지).
- `DESIGN.md`(Coinbase 토큰 문서)는 이번 리스킨 후 실효성이 없어지므로 Kinetic 기준으로 갱신하되, 별도 심화 문서화는 하지 않음.
