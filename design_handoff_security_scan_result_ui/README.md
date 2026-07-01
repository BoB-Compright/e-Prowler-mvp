# Handoff: 점검 실행 상태(RunStatus) UI 개선

## Overview
`RunStatus.tsx` (점검 실행 상태 페이지, `/runs/[id]`)를 스캔하기 쉽게 개선하는 작업입니다. 다음 4가지 요청 사항 + 후속 2가지 추가 사항을 반영합니다.

1. 요약 배지 — 상단에 양호/취약/검토 카운트 요약 (0이어도 표시)
2. 아코디언 — reason/remediation/example을 기본 접힘, 클릭 시 펼침 + 전체 펼치기/접기
3. 파이프라인 스테퍼 — clone→build→sandbox→ansible→rule_eval→claude→done 7단계 가로 스테퍼 (체크마크 진행바)
4. 카테고리 그룹핑 — catalog 페이지처럼 컨테이너/Unix/웹으로 묶어서 표시
5. (후속) 그룹 기준 전환 — 카테고리 / 자산(스캔 대상) 두 축으로 그룹핑 전환 가능한 토글 + 그룹별 양호·취약·검토 미니 요약
6. (후속) AI 강조 — 이 파이프라인이 룰 기반(ansible/rule_eval)과 Claude AI 분석을 함께 쓴다는 점을 시각적으로 강조

## About the Design Files
이 번들의 `SecurityScanResult.dc.html`은 **디자인 참조용 HTML 프로토타입**입니다 — mock 데이터로 동작하는 시각적/인터랙션 레퍼런스이며, 그대로 복사해서 쓰는 프로덕션 코드가 아닙니다. 실제 작업은 이 디자인을 참고해서 **기존 Next.js + React + TypeScript + Tailwind CSS 코드베이스**(`src/app/runs/[id]/RunStatus.tsx`, `src/lib/catalog/*`, `src/lib/checks/*`)의 기존 패턴을 그대로 따라 재구현하는 것입니다. 브라우저에서 `SecurityScanResult.dc.html`을 직접 열어 우측 상단 Tweaks 패널로 상태(파이프라인 단계, 결과 개수, 기본 펼침 여부)를 바꿔가며 동작을 확인할 수 있습니다.

## Fidelity
**High-fidelity.** 색상·타이포·간격·인터랙션이 최종안입니다. 단, 프로토타입은 인라인 스타일로 작성되어 있고 실제 코드베이스는 Tailwind 유틸리티 클래스를 사용하므로, 아래 "Design Tokens" 표의 Tailwind 클래스 매핑을 그대로 사용해 픽셀 단위로 재현해 주세요 (기존 코드가 이미 `bg-green-100 text-green-800` 같은 동일 팔레트를 쓰고 있어 대부분 그대로 이어집니다).

## Screens / Views
단일 화면입니다: **점검 실행 상태 페이지** (`/runs/[id]`, 컴포넌트 `RunStatus.tsx`). 최대 너비는 기존 `max-w-2xl`보다 넓은 `max-w-[880px]`를 제안합니다 (7단계 스테퍼가 여유 있게 들어가야 함).

레이아웃은 위에서 아래로:

### 1. 헤더
- `<h1>점검 실행 상태</h1>` 옆에 인라인으로 pill 배지 `✦ 룰 + Claude AI 하이브리드 분석` (violet). flex row, gap 10px, `flex-wrap: wrap`.
- 배지 아래 8px 정도 여백 두고 회색 텍스트로 repo URL.

### 2. 파이프라인 스테퍼 (신규)
- 7개 원(circle, 32×32px, `rounded-full`)을 가로로 나열, 각 원 사이를 2px 두께 연결선으로 잇는 표준 스테퍼 패턴.
- 단계 순서: `clone` → `build` → `sandbox` → `ansible` → `rule_eval` → `claude` → `done`.
- 각 원의 상태는 `run.stage`(현재 인덱스)와 `run.status`에서 계산:
  - 이전 단계 전부 및 (현재 단계 && status===succeeded) → **완료**: 초록 배경, 흰색 체크마크(✓)
  - 현재 단계 && status===running → **진행중**: 파란 배경, 흰 숫자, 은은한 pulse 링 애니메이션(`box-shadow` 0→8px 확산 후 사라짐, 1.8s 반복)
  - 현재 단계 && status===failed → **실패**: 빨강 배경, 흰 ✕
  - 이후 단계 → **대기**: 흰 배경 + 2px 슬레이트 테두리, 회색 숫자
- 두 원 사이 연결선: 왼쪽 원이 "완료" 상태일 때만 초록, 그 외엔 슬레이트 회색.
- 원 아래 8px 여백 두고 단계 라벨(Clone/Build/Sandbox/Ansible/룰 평가/Claude/완료), 진행중 단계만 굵게+파란색.
- **Claude 원에는 항상** 우측 상단에 작은 pill `AI` 태그(violet, 8px 폰트) — 이 단계가 AI 기반임을 표시. 완료/대기 상태와 무관하게 항상 노출.

### 3. 상태 메타 박스
- 연한 회색 배경(`bg-slate-50`), 테두리, 8px 라운드, 13px 텍스트.
- 1줄: `{단계 전체명} · {진행중/성공/실패}` — 색상은 실패=빨강/성공=초록/진행중=파랑, `font-weight:600`.
- 이미지 태그, Sandbox 컨테이너명 (있을 때만).

### 4. 에러 메시지 (있을 때만)
- 연빨강 배경 `pre` 블록, whitespace-pre-wrap.

### 5. 요약 배지 줄 (신규 요청 #1)
- pill 배지 3~4개, flex-wrap, gap 8px:
  - 양호 N (초록) — **항상 표시, 0이어도**
  - 취약 N (빨강) — **항상 표시, 0이어도**
  - 검토 N (노랑) — **항상 표시, 0이어도**
  - `hasAiChecks`일 때만: `✦ Claude AI 교차검증 N건` (violet) — AI가 판단에 관여한 항목 수
- 각 배지: `rounded-full`, 6px/12px 패딩, 13px, font-weight 600, 앞에 7×7px 색점.

### 6. 점검 결과 섹션 헤더 (신규 요청 #2, #4, 후속 #5)
- 좌측: `점검 결과 (N개)`
- 우측: **그룹 기준 토글** (신규 요청 #4 + 후속 #5) — 세그먼트 버튼 2개 `카테고리` / `자산`, 하나의 테두리 박스 안에 나란히, 활성 버튼은 `bg-blue-50 text-blue-700 font-semibold`, 비활성은 `bg-white text-slate-600`. 클릭 시 그룹핑 기준 전환.
- 그 옆 `전체 펼치기` / `전체 접기` 버튼 (현재 전부 펼쳐져 있으면 라벨이 "전체 접기"로 바뀜).

### 7. 그룹 카드들
그룹은 두 가지 모드로 렌더링 가능 (아래 "State Management" 참고):

**카테고리 모드** (기존 catalog 페이지와 동일 라벨):
- 컨테이너/이미지 하드닝
- Unix 서버 (KISA 가이드 기반)
- 웹서비스 (KISA 가이드 기반)

**자산 모드** (후속 요청 — 하나의 run이 여러 스캔 대상을 포함할 때):
- 데모에서는 컨테이너 카테고리를 이미지 2개(`order-service`, `payment-service`)로, Unix를 서버 1개(`prod-web-01`)로, Web을 서비스 1개(`checkout-web`)로 나눠 보여줍니다. 실제로는 run이 스캔한 실제 자산 목록을 그대로 사용하면 됩니다.

각 그룹 헤더 (버튼, 클릭 시 접기/펼치기):
- ▸ 쉐브론 (펼치면 90도 회전, transition)
- 그룹명 (font-weight 600, 13.5px)
- `(N개)` 회색
- 우측 정렬(`margin-left:auto`)로 미니 요약 텍스트: `양호 N · 취약 N · 검토 N` — **새로 추가된 부분, "그 결과가 필요하다"는 피드백 반영**

### 8. 점검 항목 카드 (아코디언, 신규 요청 #2)
- 각 항목은 테두리 있는 카드(8px 라운드).
- **헤더 행(버튼, 클릭 시 펼침/접힘, 기본 접힘)**: ▸ 쉐브론 · ID(모노스페이스) · 제목 · 심각도 배지(있으면) · 상태 배지(양호/취약/검토/제외/자동화전) · **출처 배지(신규: "룰 기반" 또는 "AI 분석")**
- 헤더 아래 항상 보이는 한 줄: `Evidence: {evidence}`
- **펼쳤을 때만** 보이는 상세 (padding-left 40px로 들여쓰기, 상단 얇은 구분선):
  - reason 있으면: 작은 라벨(`AI 분석 근거` violet 또는 `룰 기반 판단 근거` 회색, 11px 굵게, uppercase 느낌) + 그 아래 reason 본문
  - remediation 있으면: `조치방안: {text}`
  - example 있으면: 모노스페이스 코드 블록 (연회색 배경)

### 9. 빈 상태
- 체크 결과가 아직 없는 단계(clone 진행중, 빌드 실패 등)에서는 결과 섹션 대신 이탤릭 회색 안내문 한 줄.

### 10. 진행 이력 (기존 유지)
- 시간(모노스페이스, 회색) + `{단계} → {상태}` 텍스트, 세로 리스트.

## Interactions & Behavior
- **아코디언**: 각 체크 항목은 독립적인 열림/닫힘 상태를 가짐. 기본값은 **닫힘**. 클릭 시 토글.
- **전체 펼치기/접기**: 현재 화면에 있는 모든 체크가 펼쳐져 있는지 확인해서, 아니면 "전체 펼치기"→전부 펼침, 전부 펼쳐진 상태면 "전체 접기"→전부 닫힘.
- **그룹 접기/펼치기**: 카테고리(또는 자산) 헤더 클릭 시 해당 그룹만 접기/펼치기. 기본은 펼침.
- **그룹 기준 전환**: "카테고리"/"자산" 버튼 클릭 시 그룹 목록을 재계산. 전환 시 그룹 접힘 상태는 초기화(모두 펼침으로 리셋)해도 무방 — 카테고리 키와 자산 키는 서로 다른 네임스페이스라 혼동되지 않음.
- **파이프라인 스테퍼**: 정적 이미지가 아니라 `run.stage`/`run.status` 값에서 매 렌더마다 재계산됨 (폴링될 때마다 자동으로 진행 상태 갱신).
- **호버 상태**: 버튼류(그룹 헤더, 체크 헤더, 그룹기준 토글, 전체펼치기)는 커서 포인터 + 옅은 배경 hover 처리 권장 (프로토타입엔 미포함, 기존 코드 버튼 hover 컨벤션을 따르면 됨).
- **애니메이션**: 스테퍼의 "진행중" 원에 pulse 링 애니메이션(1.8s, box-shadow 확산), 쉐브론 회전은 0.15s ease transition.

## State Management
컴포넌트에 필요한 로컬 state (React `useState`):
```ts
const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});
const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
const [groupBy, setGroupBy] = useState<"category" | "asset">("category");
```
- `expandedChecks`: 체크 id → 펼침 여부. 체크 목록이 새로 로드되면(폴링으로 checks 배열이 바뀌면) 새 id는 기본 `false`(닫힘)로 취급.
- `collapsedGroups`: 그룹 key(카테고리명 또는 자산 id) → 접힘 여부. `groupBy` 전환 시 초기화 권장.
- `groupBy`: 위 토글 버튼 상태.

### 데이터 요구사항 — 백엔드/타입 변경 필요
1. **출처(source) 필드** — "룰 기반" vs "AI 분석" 배지를 실제로 채우려면 `CheckResultView`(`RunStatus.tsx`)와 `CheckResult`(`src/lib/checks/types.ts`)에 `source: "rule" | "ai"` 필드가 필요합니다. 파이프라인상 `rule_eval` 단계에서 확정된 항목은 `"rule"`, `claude` 단계가 판정/보강한 항목은 `"ai"`로 채우면 됩니다. 현재 스키마엔 이 구분이 없으므로 파이프라인/DB 쪽에 필드 추가가 선행되어야 합니다.
2. **자산(asset) 그룹핑** — 이건 **미래 대비 기능 제안**입니다. 현재 한 Run은 레포 1개(`repoUrl`)만 스캔하므로 자산이 항상 1개입니다. 이 경우 "자산" 토글은 그룹이 1개뿐이라 카테고리 모드와 사실상 동일하게 보이니, 지금 당장은 토글을 숨기거나 비활성화해도 됩니다. 이후 한 Run이 여러 레포/서비스/호스트를 스캔하게 되면(#42 이후 논의처럼 항목 수가 늘어나는 시나리오), 각 체크 결과에 `asset: { id: string; name: string }` 필드를 추가해서 이 토글이 실질적인 값을 갖게 됩니다.

## Design Tokens

### 색상 (기존 코드와 동일 팔레트 유지, Tailwind 클래스로 매핑)

| 의미 | 배경 | 텍스트 | Tailwind |
|---|---|---|---|
| 양호 (pass) | `#dcfce7` | `#166534` | `bg-green-100 text-green-800` |
| 취약 (fail) | `#fee2e2` | `#991b1b` | `bg-red-100 text-red-800` |
| 검토 (review) | `#fef9c3` | `#854d0e` | `bg-yellow-100 text-yellow-800` |
| 제외/해당없음 (skip) | `#f1f5f9` | `#64748b` | `bg-slate-100 text-slate-600` |
| 자동화 전 (not_automated) | `#f1f5f9` | `#94a3b8` | `bg-slate-100 text-slate-400` |
| 심각도 Critical | `#fee2e2` | `#991b1b` | `bg-red-100 text-red-800` |
| 심각도 High | `#ffedd5` | `#9a3412` | `bg-orange-100 text-orange-800` |
| 심각도 Medium | `#fef9c3` | `#854d0e` | `bg-yellow-100 text-yellow-800` |
| 심각도 Low | `#f1f5f9` | `#475569` | `bg-slate-100 text-slate-700` |
| 룰 기반 (source: rule) | `#f1f5f9` | `#64748b` | `bg-slate-100 text-slate-600` |
| AI 분석 (source: ai) | `#ede9fe` | `#6d28d9` | `bg-violet-100 text-violet-700` |
| 진행중 (running) | — | `#1d4ed8` | `text-blue-700` |
| 성공 (succeeded) | — | `#166534` | `text-green-800` |
| 실패 (failed) | — | `#b91c1c` | `text-red-700` |

### 스테퍼 원 색상
| 상태 | 배경 | 텍스트/아이콘 | Tailwind |
|---|---|---|---|
| 완료 | `#22c55e` | 흰색 ✓ | `bg-green-500 text-white` |
| 진행중 | `#3b82f6` | 흰색 숫자 + pulse 링 | `bg-blue-500 text-white` |
| 실패 | `#ef4444` | 흰색 ✕ | `bg-red-500 text-white` |
| 대기 | 흰색 | 회색 숫자 | `bg-white border-2 border-slate-200 text-slate-400` |
| 연결선 완료 | `#22c55e` | — | `bg-green-500` |
| 연결선 대기 | `#e2e8f0` | — | `bg-slate-200` |
| Claude AI 태그 | `#7c3aed` | 흰색 "AI" | `bg-violet-600 text-white` |

### 타이포그래피
- 본문/UI 텍스트: `Arial, Helvetica, sans-serif` (기존 `globals.css`와 동일, 변경 없음)
- 모노스페이스(ID, 코드, 시간): `ui-monospace, Menlo, monospace` (기존 Geist Mono 폰트 변수로 대체 가능)
- 제목 `h1`: 22px / 700
- 섹션 소제목(`h2`): 14px / 600 / `text-slate-500`
- 본문: 13~13.5px
- 배지/라벨: 11~12.5px / 600

### 간격 & 라운드
- 카드 라운드: 8px
- 배지(pill) 라운드: 999px (완전 원형)
- 배지 padding: 2px 8px (체크 항목 내) / 6px 12px (요약 배지)
- 섹션 간 상단 여백: 28~40px
- 카드/그룹 사이 gap: 8~22px

## Assets
이미지/아이콘 에셋 없음. 체크마크(✓), ✕, ▸, ✦는 전부 유니코드 문자로 처리(추가 아이콘 라이브러리 불필요, 기존 코드 컨벤션과 동일하게 텍스트로 유지해도 되고, 이미 `lucide-react` 등을 쓰고 있다면 Check/X/ChevronRight/Sparkles 아이콘으로 대체 가능).

## Files
- `SecurityScanResult.dc.html` — 이 번들에 포함된 디자인 레퍼런스 (브라우저에서 바로 열람 가능, 우측 상단 Tweaks 패널로 상태 전환).
- 참고했던 기존 코드 (여러분의 레포 안에 있음, 이 번들엔 미포함):
  - `src/app/runs/[id]/RunStatus.tsx` — 이번에 수정할 대상 컴포넌트
  - `src/app/runs/[id]/page.tsx`
  - `src/lib/catalog/types.ts` — `Category`, `Severity`, `CheckStatus`, `CATEGORY_LABELS`, `CHECK_STATUS_LABELS`
  - `src/lib/catalog/index.ts` — 카테고리별 조회 함수 (자산 그룹핑 추가 시 참고)
  - `src/lib/checks/types.ts` — `CheckResult` (source 필드 추가 위치)
  - `src/lib/pipeline/types.ts` — `Stage`, `RunStatus` (스테퍼가 사용하는 enum)
  - `src/app/catalog/page.tsx` — 카테고리 그룹핑 및 심각도 배지 스타일의 기존 컨벤션 출처
