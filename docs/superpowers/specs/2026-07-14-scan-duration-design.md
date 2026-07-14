# 점검 소요시간 기록·표시 설계

> 작성일: 2026-07-14
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
점검 파이프라인의 **실제 가동 소요시간**을 1초 단위로 기록하고, 점검 이력·상세에 "소요시간" 컬럼으로
표시한다(기존 디자인 가이드). 진행 중인 점검은 초 단위 라이브 타이머로 보인다.

## 확정 결정
- **측정 = 실제 가동시간만**: 파이프라인이 실제로 실행을 시작한 순간부터 종료까지. 배치 점검의 동시성 큐
  대기시간은 **제외**한다.
- **진행 중 = 라이브 타이머**(초 단위 증가), **완료 시 최종값 확정**.
- **표시 형식 = 한국어 단위**(`43초` / `2분 07초` / `1시간 5분`).
- **과거 이력**(이 기능 배포 전 run)은 근사값(`updated_at − created_at`)으로 표시(컬럼을 비우지 않음).

## 아키텍처

### ① 측정 — `runs` 테이블에 `started_at` / `finished_at` 신설
`runs`에 nullable 컬럼 `started_at TEXT`, `finished_at TEXT` 추가(migrate에서 PRAGMA table_info 가드).
기존 `created_at`(생성=배치 enqueue 시점) / `updated_at`(마지막 전이)은 그대로 둔다.

- **started_at**: 파이프라인이 실제로 실행을 시작하는 순간 기록.
  - repo/이미지: `runPipeline(runId, …)` 함수 최상단.
  - 서버: `runServerScanPipeline(run, asset, …)` 함수 최상단.
  - `createRun`(배치에서 자산들을 미리 만들 때)이 아니라 위 지점에서 찍으므로, 동시성 제한 큐에서 대기한
    시간은 소요시간에 포함되지 않는다.
  - `markRunStarted(runId, db)`: `UPDATE runs SET started_at = @now WHERE id = @id AND started_at IS NULL`
    — 이미 값이 있으면 덮어쓰지 않음(재진입 안전).
- **finished_at**: 파이프라인이 종료되는 순간 기록.
  - `updateRunStage` 내부에서 **종료 전이일 때** 기록: `status === "failed"` 또는
    (`stage === "done"` && `status === "succeeded"`). 이 두 조건이 repo·서버 파이프라인의 모든 정상·실패
    종료를 덮는다(AI 분석 실패 후 return 포함 — 그 경우 `status==="failed"`).
  - `cancelRun`에서도 기록.
  - `markRunFinished(runId, db)`: `UPDATE runs SET finished_at = @now WHERE id = @id AND finished_at IS NULL`
    — 첫 종료가 확정값(idempotent). 이후 어떤 전이가 와도 덮어쓰지 않는다.

소요시간(초) = `floor((finished_at − started_at) / 1000)`.

### ② 파생 규칙 — 표시할 소요시간 값
표시 계산은 순수 함수 `computeDurationSeconds(run, nowMs)`로 분리한다. 반환은
`{ kind: "done"; seconds } | { kind: "running"; seconds } | { kind: "pending" } | { kind: "approx"; seconds }`.

- **완료/실패/취소**(`finished_at` 있음): `kind:"done"`, `seconds = finished − started`.
- **진행 중**(`started_at` 있고 `finished_at` 없음): `kind:"running"`, `seconds = nowMs − started`.
- **대기 중**(`started_at` 없음, `finished_at` 없음, `status==="running"` 이면서 아직 실행 전): `kind:"pending"`.
- **과거 이력**(`started_at`/`finished_at` 둘 다 없음, 종료 상태): `kind:"approx"`,
  `seconds = updated_at − created_at`.

음수는 0으로 클램프(시계 오차 방어).

### ③ 표시 — 한국어 단위 + 라이브 타이머
- **`formatDuration(seconds)`** (`src/lib/time/duration.ts`, 신규):
  - `< 60`: `"43초"`
  - `< 3600`: `"2분 07초"` — 분이 있으면 초는 2자리 패딩. 초가 0이면 `"2분"`.
  - `>= 3600`: `"1시간 5분"` — 시간이 있으면 초는 생략. 분이 0이면 `"1시간"`.
- **`<RunDuration>`** (`src/app/_components/RunDuration.tsx`, 클라이언트 컴포넌트):
  - props: `startedAt`, `finishedAt`, `createdAt`, `updatedAt`, `status`.
  - 종료(`done`/`approx`): 정적으로 `formatDuration(seconds)`.
  - `running`: `useEffect` + `setInterval` 1초마다 현재 경과 갱신, 언마운트/종료 시 `clearInterval`.
  - `pending`: `"대기 중"`(muted).
  - CountUp은 쓰지 않음(경과 시계는 단순 1초 증가). 기존 폰트/색 토큰(`font-mono text-[13px] text-muted`) 사용.
- **점검 이력 목록**(`src/app/runs/page.tsx`): "트리거"와 "상태" 사이에 `<th>소요시간</th>` + `<td><RunDuration …/></td>`
  추가(중앙 정렬, 기존 컬럼 스타일과 동일).
- **점검 상세**(`src/app/runs/[id]/RunStatus.tsx`): 상태 라벨 영역 근처에 `<RunDuration …/>` 표시. 이미 폴링하는
  클라이언트 컴포넌트라 `run`이 갱신되면 자연히 반영되고, 진행 중엔 자체 1초 타이머로 증가.
- **배치 상세**(`src/app/runs/batch/[batchId]/page.tsx`): run 목록을 표로 보여주면 동일 컴포넌트 재사용.

### 데이터 흐름
```
createRun(enqueue) → [큐 대기 가능] → 파이프라인 실행 시작: markRunStarted
  → 단계 전이들(updateRunStage) → 종료 전이: markRunFinished
표시: computeDurationSeconds(run, now) → formatDuration → <RunDuration>
```

## 에러/경계
- **시계 역전**: `finished < started` 또는 `now < started` → 0초로 클램프.
- **started 없이 finished만**: 이론상 없음(파이프라인 시작 시 항상 markRunStarted). 방어적으로 `approx`로 폴백.
- **API 직렬화**: `/api/runs/[id]`가 반환하는 `run`에 `startedAt`/`finishedAt`이 포함돼야 상세 폴링이 라이브
  타이머를 정확히 그린다(toRun 매핑에 필드 추가).
- **목록 라이브 타이머의 한계**: `runs/page.tsx`는 서버 렌더(자동 재조회 없음). 진행 중 행의 타이머는
  클라이언트 시계로 증가하지만, 완료 전이는 페이지 새로고침 시 반영된다(현재 "진행 중" 배지도 동일 한계).
  상세 페이지가 라이브 뷰이므로 허용.

## 테스트 전략
- **단위(`formatDuration`)**: 0초/1초/59초/60초/61초/125초/3599초/3600초/3661초/7325초 경계값.
- **단위(`computeDurationSeconds`)**: done/running/pending/approx 각 분기, 음수 클램프.
- **단위(runs 스토어)**: migrate 후 `started_at`/`finished_at` 컬럼 존재; `markRunStarted` 두 번 호출해도
  첫 값 유지; `markRunFinished` idempotency; `updateRunStage` 종료 전이에서 finished_at 기록; 배치에서
  createRun 직후엔 started_at NULL(큐 대기 제외 검증).
- **회귀**: 기존 run 생성/전이/조회 테스트 그대로 통과, `toRun`에 새 필드 포함.

## 다루지 않는 것
- 단계별(stage별) 소요시간 분해(전체 파이프라인 소요만).
- 목록 페이지의 자동 폴링/실시간 완료 반영(상세 페이지가 라이브 뷰).
- 과거 이력의 정밀 백필(근사값으로 충분).
- 소요시간 기반 알림·SLA·통계 집계(별개).
