# Kinetic Security System — 디자인 문서

**시스템명:** Kinetic Security System
**출처:** Stitch 프로젝트 "Integrated Security Asset Dashboard" (`projects/936621672799851412`)
**적용 대상:** e-Prowler (자산 보안 점검 플랫폼) — Next.js App Router 전체 화면
**스펙 문서:** [`docs/superpowers/specs/2026-07-09-stitch-kinetic-reskin-design.md`](docs/superpowers/specs/2026-07-09-stitch-kinetic-reskin-design.md)
**구현 계획:** [`docs/superpowers/plans/2026-07-09-stitch-kinetic-reskin.md`](docs/superpowers/plans/2026-07-09-stitch-kinetic-reskin.md)
**토큰 정의:** `src/app/globals.css`

> 이 문서는 기존 Coinbase 디자인 시스템 분석 문서를 전면 대체한다. 2026-07-09 "Stitch Kinetic 전체 리스킨"으로 토큰·셸·전 화면이 Kinetic Security System 기준으로 교체되었고, Coinbase 문서는 더 이상 실효성이 없다.

## 1. 개요

Kinetic Security System은 보안 자산 관리·점검 대시보드를 위한 "신뢰할 수 있는 침착한 관제 시스템(trustworthy, composed control system)" 톤의 디자인 시스템이다. 캔버스는 쿨톤 오프화이트(`#f8f9ff`)이고 카드는 순백(`#ffffff`)으로, 캔버스보다 카드가 더 밝은 반전 구조를 취한다. 브랜드 액센트는 Trust Blue(`#0052ff`) 하나뿐이며, 상태 표현(양호/실패/검토/중립/진행)은 저채도 배경(10~15% opacity) + 고대비 동색 텍스트의 pill 배지로 통일한다. 그림자는 원칙적으로 사용하지 않고 1px 보더로 경계를 표현한다.

이 리스킨은 **순수 UI 리스킨**이다 — 기능·데이터 바인딩·API·서버 컴포넌트 로직은 전혀 변경하지 않았다. CSS 변수 이름은 그대로 두고 값만 교체했으므로 기존 컴포넌트가 즉시 새 톤을 반영한다.

## 2. 디자인 토큰

`src/app/globals.css`의 실제 현재 값 (2026-07-09 기준). 변수명은 Coinbase 시절과 동일하게 유지되며, 라이트/다크 모두 동일한 변수명을 `[data-theme="dark"]` 셀렉터로 오버라이드한다.

### 라이트 (`:root`)

| 변수 | 값 | 의미 (Kinetic 대응) |
|---|---|---|
| `--color-primary` | `#0052ff` | primary-container (Trust Blue) |
| `--color-secondary` | `#4c5e85` | secondary |
| `--color-pass` | `#00c076` | tertiary override (Success Green) |
| `--color-fail` | `#ba1a1a` | error |
| `--color-review` | `#f4b000` | Warning Amber (Kinetic에 amber 토큰 없어 유지) |
| `--color-neutral` | `#9ba6b5` | tertiary/disabled text |
| `--color-bg` | `#f8f9ff` | surface (쿨톤 캔버스) |
| `--color-surface` | `#ffffff` | surface-container-lowest (카드) |
| `--color-border` | `#c3c5d9` | outline-variant |
| `--color-text` | `#0e1d2b` | on-surface |
| `--color-muted` | `#697789` | secondary text |

### 다크 (`[data-theme="dark"]`)

Stitch 목업의 `dark:` 클래스(inverse-surface 계열)에서 파생. 상태색 4종(`primary`/`pass`/`fail`/`review`/`neutral`)은 라이트와 동일 값을 유지한다(어두운 배경에서도 대비 충분).

| 변수 | 값 | 의미 |
|---|---|---|
| `--color-bg` | `#0e1d2b` | on-surface 반전 (가장 어두운 캔버스) |
| `--color-surface` | `#243141` | inverse-surface (카드) |
| `--color-border` | `rgba(233, 241, 255, 0.14)` | inverse-on-surface 14% |
| `--color-text` | `#e9f1ff` | inverse-on-surface |
| `--color-muted` | `#8fa3c0` | inverse-on-surface 감쇠 |

### 형태 (radius)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-nh` | `8px` | Kinetic Standard — 표준 카드/버튼/인풋 |
| `rounded-2xl` (직접 지정) | `16px` | 대형 위젯 카드(KPI 타일 등) |
| `rounded-full` (직접 지정) | pill | 상태·심각도 배지(`StatusBadge`) 전용 |

- **그림자 금지 원칙**: 카드는 그림자를 쓰지 않고 1px `border-border`로 경계를 표현한다. 예외: 호버 lift `0 4px 12px rgba(0,0,0,0.05)`, 모달/드로어 `0 12px 32px rgba(0,0,0,0.1)`만 허용.
- 카드 컴포넌트 기본 형태: `rounded-lg border border-border bg-surface`(표준), 대형 위젯은 `rounded-2xl` 오버라이드.

### 타이포그래피

- **본문/UI**: Inter (`next/font/google`, `--font-inter`). 한글 글리프가 없어 `"Malgun Gothic", "Segoe UI", system-ui` 등으로 폴백하지만 한글 렌더링에는 영향 없음(한글은 폴백 폰트가 그린다).
- **기술 데이터(모노스페이스)**: JetBrains Mono (`--font-jbmono`, `next/font/google`) — 자산 ID·IP·경로·명령어·로그 등 tabular/technical 값에 사용. 이전 Coinbase 문서의 Consolas/CoinbaseMono를 대체.
- 두 폰트 모두 `src/app/layout.tsx`에서 `variable`로 로드되고 `globals.css`의 `@theme inline`에서 `--font-sans`/`--font-mono`로 등록된다.

`@theme inline`에 등록된 토큰은 Tailwind 4 유틸리티로 바로 동작한다 (`bg-primary`, `text-muted`, `border-border`, `bg-surface`, `bg-bg`, `text-pass`, `bg-fail/10` 등). **`var(--color-*)` 아비트러리 표기는 전 화면에서 사용 금지** — 기존 코드에서 발견하면 테마 유틸리티로 정리한다.

## 3. 공용 컴포넌트

세 컴포넌트가 `src/app/_components/`에 있으며 모든 화면이 공유한다.

### `Card` (`Card.tsx`)

```tsx
<Card title="제목" action={<button>...</button>}>
  ...본문...
</Card>
```

- 기본: `rounded-lg border border-border bg-surface`.
- `title`이 있으면 헤더 슬롯(`border-b border-border px-5 py-4`)에 `text-[15px] font-semibold` 제목 + 우측 `action` 슬롯을 렌더링.
- 본문 패딩은 기본 `p-5`, `bodyClassName`으로 오버라이드 가능(예: 데이터 테이블은 `p-0`).
- 대형 위젯 카드는 `className="rounded-2xl"`로 오버라이드해서 사용.

### `StatusBadge` (`StatusBadge.tsx` + `statusBadgeStyles.ts`)

```tsx
<StatusBadge status="pass">양호</StatusBadge>
```

pill 배지(`rounded-full px-2.5 py-0.5 text-[11px] font-semibold`). 5개 상태를 지원한다:

| 상태 | 클래스 | 용도 |
|---|---|---|
| `pass` | `bg-pass/10 text-pass` | 점검 통과, 정상 |
| `fail` | `bg-fail/10 text-fail` | 점검 실패, 실행 자체 실패 |
| `review` | `bg-review/15 text-review` | 검토 필요, 경고 |
| `neutral` | `bg-neutral/15 text-muted` | 미해당/skip/비활성 |
| `progress` | `bg-primary/10 text-primary` | 진행 중(running) |

주의: 파이프라인 자체 실패(`run.status === "failed"`)와 확인된 취약점(`fail` outcome)은 배지 색은 같은 `fail`을 쓰되 라벨 텍스트(예: "실패" vs "취약")로 구분한다 — 두 개념을 같은 집계 버킷에 합치지 않는다(대시보드/프로젝트 화면 참고).

### `SectionLabel` (`SectionLabel.tsx`)

```tsx
<SectionLabel>테이블 헤더 라벨</SectionLabel>
```

`text-[12px] font-bold uppercase tracking-[0.05em] text-muted` — 테이블 헤더, 섹션 오버라인에 공용으로 사용.

## 4. 공통 스타일 레시피

아래 표는 `docs/superpowers/plans/2026-07-09-stitch-kinetic-reskin.md`의 "공통 스타일 레시피" 표를 그대로 옮긴 것이다 — 모든 화면이 예외 없이 이 레시피를 따른다.

| 요소 | 클래스 레시피 |
|---|---|
| 페이지 컨테이너 | `mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8` |
| 페이지 타이틀 | `text-[26px] font-bold tracking-[-0.02em]` + 아래 부제 `text-[13px] text-muted` |
| 카드 | `Card` 컴포넌트 — `rounded-lg border border-border bg-surface` |
| 대형 위젯 카드 | `Card`에 `className="rounded-2xl"` 오버라이드 |
| 섹션/테이블 헤더 라벨 | `SectionLabel` 컴포넌트 — 12px/700/uppercase/tracking 0.05em/muted |
| 상태·심각도 배지 | `StatusBadge` 컴포넌트 — pill, `bg-{status}/10 text-{status}` |
| 기본(Primary) 버튼 | `rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90` |
| 보조(Secondary) 버튼 | `rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5` |
| 위험(Danger) 버튼 | `rounded-lg bg-fail px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90` |
| 입력 필드 | `rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary` + 라벨은 항상 입력 위 `text-[13px] font-medium` (플레이스홀더 온리 금지) |
| 데이터 테이블 | 헤더 행 `SectionLabel` 스타일, 줄무늬 없음, `divide-y divide-border`, 행 호버 `hover:bg-bg` |
| 기술 데이터(ID·IP·경로·커맨드) | `font-mono text-[13px]` |
| 그림자 | 카드에 그림자 금지(보더로 경계). 모달/드로어만 `shadow-[0_12px_32px_rgba(0,0,0,0.1)]` |

주의: `bg-primary`, `text-muted`, `border-border`, `bg-surface`, `bg-bg`, `text-pass`, `bg-fail/10` 등은 `globals.css`의 `@theme inline` 등록 덕에 Tailwind 4 유틸리티로 바로 동작한다 (`var(--color-*)` 아비트러리 표기 불필요). 기존 코드의 `[var(--color-*)]` 아비트러리 표기를 만나면 수정하는 김에 테마 유틸리티로 정리한다.

## 5. 앱 셸

- **`AppSidebar`** (`src/app/_components/AppSidebar.tsx`, client): 고정 좌측 `w-64`, 로고("NH-Guardian" + "e-Prowler" 서브텍스트), 내비 5항목(대시보드/자산 관리/프로젝트/점검 이력/카탈로그). 활성 항목은 primary 배경. `md` 미만에서는 숨김.
- **`AppHeader`**: 흰 배경 `h-16` 유틸 바 — 페이지 브레드크럼 + 우측 ThemeToggle. 모바일(`md` 미만)에서는 내비 링크를 헤더에 가로 스크롤로 노출.
- `layout.tsx`: `body`에 `AppSidebar` + `md:pl-64` 본문 컬럼(`AppHeader` + `children`).

## 6. 아이콘

Material Symbols 등 외부 CDN·아이콘 폰트를 도입하지 않는다. 아이콘은 인라인 SVG(`width 15, stroke currentColor, strokeWidth 2`)로 통일한다.

## 7. 범위 외 / 알려진 제약

- 기능·데이터 바인딩·API는 이번 리스킨에서 변경하지 않았다. 목업에만 있고 실데이터가 없는 요소(트렌드 화살표, 알림/설정 아이콘, 더미 지표 등)는 구현하지 않았다 — 목록은 [`docs/superpowers/specs/2026-07-09-reskin-backlog.md`](docs/superpowers/specs/2026-07-09-reskin-backlog.md) 참고.
- 모바일 전용 화면 신규 설계 없음 — 기존 반응형 수준 유지.
