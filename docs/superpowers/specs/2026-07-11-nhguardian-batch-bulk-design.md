# NH-Guardian 명칭 통일 + 일괄 점검 가시성 + 자산 일괄 작업 설계

날짜: 2026-07-11
상태: 승인됨

## 배경 / 문제

1. 앱 명칭이 e-Prowler(구명)와 NH-Guardian(사이드바 워드마크)로 혼재한다.
2. 여러 자산을 일괄 점검하면 배치 페이지에 run별 "진행 중" 배지만 떠서 **지금 어떤 단계가 돌고 있는지** 알 수 없다.
3. 자산이 많아지면 하나씩 점검·이동·삭제하는 것이 비현실적이다 — 일괄 선택과 일괄 작업이 없다.
4. 서버 자산 점검(SSH + Ansible)이 실제 서버를 상대로 끝까지 도는지 검증된 적이 없다.

## 목표

- 사용자 표면(타이틀·헤더·사이드바·로그인·쿠키명)에서 e-Prowler 명칭 제거, NH-Guardian으로 통일.
- 일괄 점검 중 배치 페이지에서 run별 현재 단계와 진행률, 전체 진행 요약이 보이고 자동 갱신된다.
- 자산 목록에서 복수 선택 후 일괄 점검 / 프로젝트 이동 / 정기 점검 설정 / 삭제가 가능하다.
- Docker 간이 SSH 서버 3대를 상대로 실제 일괄 점검이 결과까지 도는 것을 확인한다(E2E 검증 세션).

## 비목표

- GitHub 리포 URL(`e-Prowler-mvp`)·과거 스펙/플랜 문서의 명칭 변경 (역사 기록 유지).
- SSE/WebSocket 실시간 채널 — 기존 폴링(AutoRefresh) 유지.
- 자산 필드(담당자·OS 등) 일괄 수정 — 백로그.
- sshpass 설치가 필요한 패스워드 인증 E2E — 키 인증으로 검증.

## A. 명칭 통일 (NH-Guardian)

| 위치 | 현재 | 변경 |
|---|---|---|
| `src/app/layout.tsx` metadata.title | "e-Prowler — 자산 보안 점검" | "NH-Guardian — 자산 보안 점검" |
| `src/app/_components/AppHeader.tsx` 폴백 | "e-Prowler" | "NH-Guardian" |
| `src/app/_components/AppSidebar.tsx` 서브텍스트 | "e-Prowler · 자산 보안 점검" | "자산 보안 점검" (워드마크가 이미 NH-Guardian) |
| `src/app/login/LoginForm.tsx` | "e-Prowler 계정으로 로그인하세요." | "NH-Guardian 계정으로 로그인하세요." |
| `src/lib/auth/constants.ts` SESSION_COOKIE_NAME | "eprowler_session" | "nhg_session" |
| `docs/adr/0001-authentication-local-accounts.md` 쿠키 예시 | `eprowler_session=garbage` | `nhg_session=garbage` |
| `README.md` 본문 명칭 서술 | e-Prowler | NH-Guardian (클론 URL은 유지) |

쿠키명 변경으로 **기존 로그인 세션은 1회 만료**된다(재로그인 필요). sessions 테이블 데이터는 손대지 않는다.

## B. 일괄 점검 진행 가시성

### runProgress 순수 함수

`src/lib/pipeline/runProgress.ts`:

- 입력: `Run`(stage, status, sourceType). 출력: `{ label: string; fraction: number }`.
- 컨테이너 경로(git/local_image) 단계 순서: clone → build → sandbox → ansible → rule_eval → claude → done. 한국어 라벨: 클론 → 빌드 → 샌드박스 준비 → Ansible 점검 → 규칙 평가 → AI 분석 → 완료. local_image는 clone/build를 건너뛰므로 sandbox부터 시작하는 5단계로 계산.
- 서버 경로(server) 단계 순서: connect → ansible_scan → rule_evaluation → claude_analysis → done. 라벨: SSH 연결 → Ansible 점검 → 규칙 평가 → AI 분석 → 완료.
- fraction = 현재 단계 순번 / 해당 경로 전체 단계 수 (done = 1.0). 알 수 없는 stage는 label 그대로 출력하고 fraction 0.
- status가 running이 아니면 fraction은 여전히 계산하되, 표시 여부는 컴포넌트가 결정.
- 단위 테스트: 경로별 단계 매핑, local_image 오프셋, done=1.0, 미지 stage 방어.

### 배치 페이지 (`/runs/batch/[batchId]`)

- 헤더: "완료 n / 전체 N" + 전체 진행바. 전체 진행률 = (완료·실패·취소 run 수 + 진행 중 run들의 fraction 합) / N.
- 각 run 행: 기존 컬럼 유지 + 진행 중 run에는 현재 단계 라벨과 미니 진행바(4px 높이, primary 색), 종료 run에는 기존 판정 배지.
- 진행 중 run이 하나라도 있으면 `AutoRefresh` 활성(기존 3초 폴링 컴포넌트 재사용).

### 대시보드 활동 피드

- 진행 중 run 이벤트의 detail을 "점검 진행 중 — {단계 라벨}"로 확장. `buildActivityFeed`의 `RunFeedInput`에 `stageLabel: string | null` 필드 추가(running일 때만 채움).

## C. 자산 일괄 선택/작업

### UI (`/assets`)

- 기존 서버 컴포넌트 페이지에서 테이블을 클라이언트 컴포넌트 `AssetTable`로 추출. 페이지는 데이터 조회·직렬화만 담당.
- 행 체크박스 + 헤더 체크박스(현재 필터 결과 전체 선택/해제). 선택 0개면 액션 바 숨김.
- 선택 시 상단 액션 바: "N개 선택" + 버튼 4개 — 일괄 점검 / 프로젝트 이동 / 정기 점검 설정 / 삭제.
  - 프로젝트 이동: 프로젝트 목록 드롭다운(+"소속 없음" 옵션) 후 적용.
  - 정기 점검 설정: 매일/매주/매월 + 해제 선택 후 적용.
  - 삭제: 확인 다이얼로그(선택 자산 수 명시) 후 실행.
- 작업 결과는 액션 바 아래 한 줄 요약으로 표시: "완료 N건 · 건너뜀 M건 (실행 중 점검)" 등. **부분 실패를 조용히 삼키지 않는다.**
- 일괄 점검 성공 시 `/runs/batch/{batchId}`로 이동(B의 진행 UI로 관찰).

### API (신규, 전부 세션 가드 필수)

| 엔드포인트 | 요청 | 동작 · 응답 |
|---|---|---|
| `POST /api/assets/bulk/scan` | `{ assetIds: string[] }` | 배치 생성 후 자산별 run 시작(기존 fleet 스캔의 자산 목록 버전 — repo/server 경로 재사용, 동시성 정책 동일). 이미 실행 중인 자산은 건너뜀. `{ batchId, started, skipped }` |
| `PATCH /api/assets/bulk/project` | `{ assetIds, projectId: string \| null }` | 소속 일괄 변경. 존재하지 않는 projectId는 400. `{ updated }` |
| `POST /api/assets/bulk/schedule` | `{ assetIds, frequency: "daily"\|"weekly"\|"monthly"\|null }` | null이면 스케줄 해제. `{ updated }` |
| `POST /api/assets/bulk/delete` | `{ assetIds }` | 자산별 `deleteAsset` 시도, `AssetInUseError`(실행 중 점검)는 건너뜀. `{ deleted, skipped: string[] }` |

- 공통: 빈 assetIds는 400, 존재하지 않는 자산 id는 무시하고 결과에 포함하지 않음.
- scan은 시작 가능한 자산이 0개면 배치를 만들지 않고 409 (빈 배치 페이지 방지 — import 흐름과 같은 원칙).

## D. E2E 실서버 점검 검증 세션 (구현 완료 후 수행)

1. SSH 키쌍 생성(임시), Docker sshd 컨테이너 3개 기동 — 포트 2221/2222/2223, root 로그인 + 공개키 인증 허용 (예: `lscr.io/linuxserver/openssh-server` 또는 ubuntu 기반 자체 이미지).
2. 서버 자산 3개 등록(host 127.0.0.1, 포트 각각, authType key, 개인키 등록) → 새 프로젝트로 묶기.
3. `/assets`에서 3개 선택 → 일괄 점검 실행 → 배치 페이지에서 단계 진행(SSH 연결 → Ansible 점검 → …)이 실시간으로 보이는지 확인.
4. 완료 후 run 리포트에서 실제 Ansible 점검 결과(U-xx 항목 pass/fail)와 대시보드 반영(점수·도넛·피드) 확인.
5. 발견되는 실제 결함은 즉시 수정. 종료 후 컨테이너·임시 키·테스트 자산 정리.

전제: 로컬에 ansible-playbook 2.21·Docker 확인됨. sshpass가 없으므로 키 인증만 사용.

## 에러/엣지 케이스

- 일괄 삭제 중 실행 중 점검 자산: 건너뛰고 skipped로 보고 (전체 실패 아님).
- 일괄 점검 대상에 이미 실행 중인 자산 포함: 해당 자산 건너뜀(중복 run 방지), started/skipped로 보고.
- 배치의 모든 run이 종료된 뒤 배치 페이지 재방문: 진행바 대신 기존 결과 요약만 표시, AutoRefresh 꺼짐.
- runProgress에 미지의 stage: fraction 0 + stage 문자열 그대로 (신규 단계 추가 시 안전).

## 테스트 전략

- `runProgress` 단위 테스트 (경로·오프셋·done·미지 stage).
- bulk API 4종: 라우트 테스트 (세션 가드 401, 정상 동작, 빈 입력 400, 부분 skip, scan 전부-스킵 409). 기존 in-memory DB 패턴.
- `buildActivityFeed`의 stageLabel 확장 테스트.
- UI는 구현 후 D 세션에서 실전 검증(브라우저 + 실제 스캔).

## 진행 순서

A → B → C 구현(각각 TDD, 태스크 분리) → D 검증 세션.
