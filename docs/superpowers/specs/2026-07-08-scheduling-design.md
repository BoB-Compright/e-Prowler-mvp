# C: 점검 스케줄링 — Design

**Date:** 2026-07-08
**Status:** Approved by user, ready for implementation plan
**Depends on:** A1 (자산 관리 + 프로젝트 그룹핑) — 스케줄은 자산 단위로 걸리므로 자산 모델을 전제로 함. 서버 자산 스케줄은 A2(SSH 점검 실행 엔진)의 실행 경로를 그대로 재사용함.

## Background

현재 점검은 `/runs`에서 사용자가 직접 트리거하는 1회성 실행만 가능하다. 보안 담당자는 등록된 자산(레포/서버)에 대해 "매일/매주/매월" 같은 정기 점검을 걸어두고, 별도로 신경 쓰지 않아도 자동으로 재점검이 이뤄지길 원한다.

전체 로드맵은 A1 → A2 → B(컴플라이언스 프레임워크 일반화) → C(점검 스케줄링) → D(CVE 실시간 감시)였으나, 사용자 판단으로 B를 건너뛰고 C를 먼저 설계한다. B가 다루는 "여러 컴플라이언스 프레임워크 지정"은 이 설계의 스코프에 포함하지 않으며, 스케줄된 점검도 현재와 동일하게 단일(KISA) 기준으로 실행된다.

## Scope

**포함:**
- 자산(레포/서버)별 개별 점검 스케줄 등록/수정/삭제/on-off
- 주기 프리셋: 매일 / 매주(요일 지정) / 매월(날짜 지정, 말일 클램프)
- 서버 프로세스가 켜져 있는 동안 in-process로 스케줄 체크 및 트리거
- 프로세스가 꺼져 있던 동안 놓친 스케줄의 재기동 시 캐치업 실행
- 진행 중인 run과의 충돌 시 skip 처리
- run에 트리거 출처(수동/예약) 기록

**제외 (이번 스코프 아님):**
- 컴플라이언스 프레임워크 다중화(B) — 스케줄된 점검도 현재 단일 기준 그대로
- CVE 실시간 감시(D)
- 이메일 등 외부 알림 발송 — 결과는 대시보드에서만 확인
- 자유 형식 cron 표현식 — 프리셋(매일/매주/매월)만 지원
- 프로젝트 단위 일괄 스케줄 — A2의 수동 fleet scan과는 별개로, 스케줄은 항상 자산 단위

## 아키텍처

`src/lib/scheduling/scheduler.ts` (신규):
- 서버 프로세스 시작 시 `checkDueSchedules()`를 1회 즉시 실행한 뒤, `setInterval`로 1분마다 반복 실행
- `checkDueSchedules()`: `enabled = 1 AND next_run_at <= now()`인 스케줄을 조회
  - 해당 자산에 진행 중(`status = 'running'`)인 run이 있으면: 트리거하지 않고 `last_skip_reason`을 기록, `next_run_at`을 다음 주기로 갱신하고 다음 스케줄로 넘어감
  - 없으면: 기존 오케스트레이터 진입점(레포는 `createRun` + 파이프라인, 서버는 A2의 `connect → ansible_scan → ...` 경로)을 `triggerType: 'scheduled'`로 직접 호출, `last_run_at = now`, `next_run_at`을 다음 주기로 갱신
- 서버가 꺼져 있던 동안 지난 스케줄은 재기동 직후의 첫 즉시 체크에서 `next_run_at <= now()` 조건에 걸려 자연스럽게 캐치업됨 — 별도 캐치업 분기 불필요
- 타임존은 서버가 실행되는 로컬 시각 기준 (단일 로컬 프로세스 MVP 전제, 이 앱은 여러 인스턴스로 동시에 뜨지 않는다는 기존 전제와 동일)
- 외부 큐/cron 라이브러리 불필요 (A2와 동일한 원칙)

## 데이터 모델

### `schedules` (신규 테이블)
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | PK | |
| `asset_id` | FK, UNIQUE | 자산당 스케줄 1개 |
| `frequency` | enum(`daily`\|`weekly`\|`monthly`) | |
| `day_of_week` | INTEGER, nullable | `weekly`일 때만 사용 (0=일요일~6=토요일) |
| `day_of_month` | INTEGER, nullable | `monthly`일 때만 사용 (1~31) |
| `time_of_day` | TEXT | `'HH:mm'`, 로컬 시각 |
| `enabled` | BOOLEAN | on/off 토글 |
| `next_run_at` | TEXT (timestamp) | 다음 실행 예정 시각, 저장/갱신 시마다 재계산 |
| `last_run_at` | TEXT (timestamp), nullable | 마지막으로 실제 트리거된 시각 |
| `last_skip_reason` | TEXT, nullable | 마지막 skip 사유 (예: `"이미 진행 중인 run 존재"`) |
| `created_at` / `updated_at` | timestamp | |

`asset_id`는 `REFERENCES assets(id)` (DB 레벨 `ON DELETE CASCADE` 없음) — 자산이 hard delete될 때 `deleteAsset()`의 트랜잭션이 스케줄 행을 명시적으로 함께 삭제한다(이 코드베이스는 SQLite FK cascade에 의존하지 않고 모든 cascade를 애플리케이션 코드로 처리하는 기존 관례를 따른다). `better-sqlite3`는 기본적으로 `foreign_keys=1`(ON)이며, 모든 명시적 cascade delete가 자식을 부모보다 먼저 지우는 순서를 지키고 있어 FK 활성화 여부와 무관하게 안전하다.

### `runs` 테이블 확장
- `trigger_type` 컬럼 추가 (`TEXT NOT NULL DEFAULT 'manual'`, 값: `'manual'` \| `'scheduled'`)

### `next_run_at` 계산
순수 함수 `computeNextRun(schedule, fromDate)`:
- `daily`: `fromDate` 기준 다음으로 오는 `time_of_day`
- `weekly`: 다음으로 오는 `day_of_week` + `time_of_day`
- `monthly`: 다음 달(또는 이번 달)의 `day_of_month` + `time_of_day`. 해당 월에 그 날짜가 없으면(예: 2월 31일) 그 달의 마지막 날로 클램프

## UI

| 화면 | 내용 |
|---|---|
| `/assets/[id]` (A1에서 신규, 이번에 확장) | "정기 점검" 섹션 추가 — 주기 선택(매일/매주+요일/매월+날짜), 시각 입력, on/off 토글, 마지막 실행/skip 사유 표시 |
| `/assets` (A1) | 목록에 스케줄 활성 여부 아이콘 표시 |
| `/runs` (A1/A2에서 변경) | 목록에 수동/예약 배지 표시 |

## 엣지 케이스 & 에러 처리

| 상황 | 처리 |
|---|---|
| 스케줄 시각에 해당 자산이 이미 진행 중인 run 보유 | 트리거 skip, `last_skip_reason` 기록, `next_run_at`은 다음 주기로 갱신 (재시도 없음) |
| 월간 스케줄의 날짜가 해당 월에 없음 (예: 31일, 2월) | 그 달의 마지막 날로 클램프해서 실행 |
| 자산 hard delete | 스케줄 cascade 삭제 |
| 서버 자산의 SSH 자격증명이 만료/오류 | 스케줄러는 트리거만 담당, 인증 실패 처리는 A2의 기존 로직(재시도 없이 즉시 실패) 그대로 적용 |
| 자산이 프로젝트 간 이동 또는 미분류화 | 스케줄은 자산에 종속이므로 영향 없음 |
| 스케줄 off 상태에서 자산 삭제 | 스케줄도 함께 삭제 (활성 여부 무관) |
| 서버 프로세스가 여러 개 동시에 뜬 경우 | 스코프 밖 — 기존 "단일 로컬 프로세스" 전제와 동일하게 다중 인스턴스 미지원 |

## 테스트 전략

**단위 테스트**
- `computeNextRun` — daily/weekly/monthly 각 케이스, 월말 날짜 클램프(2월 31일 → 28/29일)
- skip 판단 로직 — 진행 중 run 존재 시 skip, 없으면 트리거
- `enabled=false`인 스케줄은 체크 대상에서 제외되는지

**통합 테스트**
- due 스케줄 트리거 → run 생성 확인, `trigger_type='scheduled'` 기록 확인, `last_run_at`/`next_run_at` 갱신 확인
- 진행 중인 run이 있는 자산의 due 스케줄 → skip되고 `last_skip_reason` 기록, run은 생성되지 않음
- 과거 시각의 `next_run_at`을 가진 스케줄이 재기동 직후 즉시 체크에서 캐치업 트리거되는지
- 자산 hard delete → 연결된 스케줄 cascade 삭제 확인
- 스케줄 CRUD API (생성/수정/삭제/조회)

## 로드맵 컨텍스트 (참고용, 이번 스코프 아님)

- **B**: 컴플라이언스 프레임워크 일반화 (건너뛰고 나중에 별도 설계)
- **D**: CVE 실시간 감시 파이프라인 (NVD 실시간 폴링 + AI 영향 자동 분석)
