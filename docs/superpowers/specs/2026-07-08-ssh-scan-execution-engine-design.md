# A2: SSH 점검 실행 엔진 — Design

**Date:** 2026-07-08
**Status:** Approved by user, ready for implementation plan
**Depends on:** A1 (자산 관리 + 프로젝트 그룹핑) — 서버 자산의 `encrypted_secret` 저장 구조를 전제로 함

## Background

현재 `ansibleRunner.ts`는 `ansible-playbook -i "${containerName}," -c community.docker.docker`로 로컬 Docker sandbox 컨테이너 1개만 대상으로 실행한다. 실제 원격 서버(SSH)를 대상으로 한 점검 로직은 전혀 없다.

A1에서 서버 자산(호스트 IP, SSH 인증정보)을 등록할 수 있게 되므로, A2는 그 자산들을 실제로 SSH를 통해 점검하는 실행 엔진을 만든다.

## Scope

**포함:**
- 서버 자산 1건 단건 점검 (SSH 연결)
- 프로젝트 단위 일괄 점검(fleet scan, 최대 5대 동시)
- AES-256 암호화 유틸리티 (A1의 `encrypted_secret` 컬럼과 공유)
- 서버 전용 파이프라인 단계 및 UI

**제외:**
- 컴플라이언스 프레임워크 다중화(B), 점검 스케줄링(C), CVE 실시간 감시(D)는 별도 설계

## 연결 방식

`ansible/security-checks.yml`을 그대로 재사용한다. `ansibleRunner.ts`가 자산 타입에 따라 커넥션 인자를 분기한다.

| 자산 타입 | 커넥션 | 인증 |
|---|---|---|
| `container`(기존) | `-c community.docker.docker` | 없음 |
| `server`, 비밀번호 인증 | `-c paramiko` | `ansible_ssh_pass` extra-var로 전달 (파일에 쓰지 않음, `sshpass` 바이너리 불필요) |
| `server`, 키 인증 | `-c ssh` | 복호화한 키를 0600 권한 임시 파일에 기록 → `--private-key <tmpfile>` → 실행 종료(성공/실패 무관) 즉시 `try/finally`로 삭제 |

비밀번호·키 모두 로그·에러 메시지에 노출하지 않는다 (A1의 sanitizer 정책과 동일 기조).

## 동시성 / 타임아웃 / 재시도

기존 README에 명시된 수치를 재사용한다 (로컬 단일 사용자 MVP 전제, 외부 큐 라이브러리 불필요 — in-process 세마포어로 충분):

- 최대 5대 동시 실행
- 서버당 5분 타임아웃 (컨테이너 경로의 60초 타임아웃과는 별도 — 네트워크 지연 고려)
- **연결 실패**(timeout, connection refused)만 30초 간격 최대 3회 재시도
- **인증 실패**(잘못된 비밀번호/키)는 재시도하지 않고 즉시 실패 처리 — 의미 없는 재시도로 시간 낭비하지 않음

## 파이프라인 단계

서버 타입 run은 기존 6단계(clone→build→sandbox→ansible→claude→done) 대신 4단계를 쓴다:

```
connect → ansible_scan → rule_evaluation → claude_analysis → done
```

기존 `runs.source_type` 컬럼(현재 `'git'` 기본값)에 `'server'` 값을 추가해 재사용한다. UI(`RunStatus.tsx` 계열)는 `run.source_type`에 따라 다른 단계 목록을 렌더링한다.

## 데이터 모델 추가

### `runs` 테이블 확장
- `batch_id` (TEXT, nullable) — fleet scan으로 생성된 run들을 묶는 키

### `scan_batches` (신규 테이블)
| 필드 | 설명 |
|---|---|
| `id` | PK (batch_id) |
| `project_id` | FK → projects |
| `created_at` | |

## 암호화 유틸리티

`src/lib/crypto/secretCipher.ts` (신규, A1의 `encrypted_secret` 저장에도 사용):

- AES-256-GCM, Node 내장 `crypto` 모듈 사용 (외부 라이브러리 불필요)
- 키: `INFRA_SECURITY_MASTER_KEY` 환경변수 (base64 인코딩된 32바이트 키)
- 저장 형식: `iv:authTag:ciphertext` (각 base64) 문자열로 연결해 DB 컬럼에 저장
- `INFRA_SECURITY_MASTER_KEY`가 없으면 기동 시 명확한 에러 메시지로 안내 (README에 이미 있는 키 생성 방법 재사용)

## UI

| 화면 | 내용 |
|---|---|
| `/runs` (A1에서 변경된 화면) | 서버 자산 선택 시 "단건 점검 시작" 버튼 노출 |
| `/projects/[id]` (A1에서 신규) | "이 프로젝트 서버 일괄 점검" 버튼 → fleet scan 트리거 |
| `/runs/batch/[batchId]` (신규) | 배치 내 개별 run 상태 목록. 각 항목 클릭 시 기존 `/runs/[id]` 상세로 이동 |

## 엣지 케이스 & 에러 처리

| 상황 | 처리 |
|---|---|
| fleet scan 중 특정 서버 연결 실패 | 해당 run만 `fail`, 나머지 서버는 격리되어 계속 진행 |
| 동시성 5 초과 요청 | 큐에 대기, 슬롯 확보되는 대로 순차 실행 |
| 인증 실패 (잘못된 비번/키) | 즉시 `fail`, 재시도 없음, error_message는 "인증 실패"로만 기록 (자격증명 노출 금지) |
| 연결 타임아웃/connection refused | 30초 간격 최대 3회 재시도 후에도 실패하면 `fail` |
| 임시 SSH 키 파일 | 프로세스 종료 시 성공/실패 관계없이 항상 삭제 (`try/finally`) |
| playbook의 컨테이너 전제 태스크 존재 가능성 | 구현 완료 후 `ansible-playbook-reviewer` 서브에이전트로 재검토 (컨테이너 전용 가정이 실서버에서 깨지는지 확인) |

## 테스트 전략

**단위 테스트**
- `secretCipher` 암복호화 라운드트립 (AES-256-GCM)
- SSH 커맨드 빌더 — 비밀번호 인증/키 인증 케이스별로 올바른 ansible 인자가 생성되는지
- 재시도 로직 — 연결 실패 시 재시도, 인증 실패 시 재시도 안 함 (mock timer로 백오프 타이밍 검증)
- `batch_id` 기준 run 조회 함수

**통합 테스트**
- fleet scan 트리거 → N개 run 생성 + 동일 `batch_id` 공유 확인
- 동시성 5 제한 확인 (mock ansible 호출에 지연을 주고 6번째가 대기하는지 검증)
- 연결 실패 시 run 상태가 `fail`로 전환되는지 확인
- 임시 키 파일이 실행 종료 후 파일시스템에서 삭제됐는지 확인
- 인증 실패 시 재시도 카운트가 0인지 확인 (즉시 실패)

## 로드맵 컨텍스트 (참고용, 이번 스코프 아님)

- **B**: 컴플라이언스 프레임워크 일반화
- **C**: 점검 스케줄링 (사용자 요청 vs 주기적)
- **D**: CVE 실시간 감시 파이프라인
