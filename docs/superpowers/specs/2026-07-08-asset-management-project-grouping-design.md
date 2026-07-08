# A1: 자산 관리 + 프로젝트 그룹핑 — Design

**Date:** 2026-07-08
**Status:** Approved by user, ready for implementation plan

## Background

e-Prowler-mvp는 원래 서버 자산(CSV 업로드) 인벤토리 기반 인프라 스캔 도구로 구상됐으나, PRD가 v2(GitHub 레포 → Docker 빌드 → Sandbox → Ansible 컨테이너 점검 파이프라인)로 개정되면서 "자산"이라는 영속적 개념이 코드에서 사라졌다. 현재 `src/app/runs`는 레포 URL을 그때그때 입력해 1회성으로 스캔하는 구조다.

보안 담당자는 여러 프로젝트에 걸친 자산(레포/서버)을 한눈에 관리하면서도, 프로젝트 단위로 결과를 묶어 해당 PM에게 전달할 필요가 있다. 이 문서는 그 첫 단계인 "자산 등록 + 프로젝트 그룹핑" 서브 프로젝트(A1)를 다룬다.

전체 로드맵은 A1 → A2(SSH 점검 실행 엔진) → B(컴플라이언스 프레임워크 일반화) → C(점검 스케줄링) → D(CVE 실시간 감시 파이프라인) 순서로 진행하기로 했다. 이 문서는 A1만 다룬다.

## Scope

**포함:**
- 자산(레포/서버) 등록, 조회, 프로젝트 그룹핑
- 프로젝트 CRUD + PM 연락처 + 공유링크 발급
- 엑셀 일괄 업로드
- `/runs` 플로우를 "자산 선택 후 실행"으로 전환

**제외 (A2 이후로 이연):**
- 서버(SSH) 자산에 대한 실제 점검 실행 엔진 — A1은 등록/자격증명 저장까지만. 실제 SSH 접속·Ansible 실행은 A2에서 별도 설계.
- 컴플라이언스 프레임워크 다중화, 점검 스케줄링, CVE 실시간 감시는 B/C/D에서 별도 설계.

## Data Model

### Project
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | PK | |
| `name` | string | 프로젝트명 |
| `pm_name` | string | 담당 PM 이름 |
| `pm_email` | string | 담당 PM 이메일 |
| `share_token` | string, unique | 추측 불가능한 랜덤 토큰 (공유링크 URL에 사용) |
| `share_password_hash` | string | 공유링크 비밀번호 해시 (bcrypt/argon2) |
| `created_at` | timestamp | |

### Asset (공통 + 타입별 서브 테이블)
공통 필드:
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | PK | |
| `type` | enum(`repo`\|`server`) | |
| `project_id` | FK, nullable | null = 미분류 |
| `display_name` | string | |
| `created_at` | timestamp | |

`repo` 타입 전용:
| 필드 | 설명 |
|---|---|
| `repo_url` | 정규화된 URL. dedupe 키 |

`server` 타입 전용:
| 필드 | 설명 |
|---|---|
| `host_ip` | |
| `hostname` | |
| `ssh_port` | |
| `auth_type` | enum(`password`\|`key`) |
| `username` | |
| `encrypted_secret` | AES-256, 기존 `INFRA_SECURITY_MASTER_KEY`로 암호화한 비밀번호 또는 SSH 키 |

dedupe 키: `host_ip` + `ssh_port` 조합

### Run (기존 테이블 확장)
- `asset_id` FK 컬럼 추가 (필수)
- 자산이 hard delete되면 `ON DELETE CASCADE`로 관련 run도 함께 삭제

## UI / 플로우

| 화면 | 내용 |
|---|---|
| `/assets` (신규) | 전체 자산 목록. 필터: 프로젝트별 / 미분류 / 타입별 |
| `/assets/new` (신규) | 자산 등록 폼. 타입 선택 → 타입별 입력 필드 |
| `/assets/upload` (신규) | 엑셀 일괄 업로드. 템플릿 다운로드(레포 시트 + 서버 시트) → 업로드 → 행별 성공/실패 결과 |
| `/projects` (신규) | 프로젝트 목록/생성/수정/삭제. PM 연락처, 공유링크 발급/재발급 |
| `/share/[token]` (신규) | PM용 읽기전용 뷰. 비밀번호 입력 후 해당 프로젝트 자산·실행이력만 노출. 세션 없음, 링크당 접근 |
| `/runs` (기존, 변경) | URL 직접입력 제거 → 등록된 자산에서 선택 후 실행. 서버 자산 선택 시 UI 훅만 마련(실행은 A2) |

플로우:
```
프로젝트 생성 (PM 이메일 입력, 토큰+비번 자동 발급)
   ↓
자산 등록 (수동 or 엑셀) → 프로젝트 지정 or 미분류
   ↓
/runs 에서 자산 선택 → 점검 시작 (레포=기존 파이프라인 그대로)
   ↓
결과가 asset_id로 누적 → /assets/[id] 상세에서 이력 확인
   ↓
보안담당자가 프로젝트 공유링크(URL+비번)를 PM에게 전달
   ↓
PM이 /share/[token] 접속 → 비번 입력 → 해당 프로젝트 결과만 열람
```

## 엑셀 업로드 포맷

자산 타입별 별도 시트/템플릿.

- **레포 시트**: `repo_url`, `display_name`, `project_name`(선택, 미기입 시 미분류)
- **서버 시트**: `host_ip`, `hostname`, `ssh_port`, `auth_type`(`password`\|`key`), `username`, `secret`(비밀번호 또는 키 내용), `project_name`(선택)

## 엣지 케이스 & 에러 처리

| 상황 | 처리 |
|---|---|
| 레포 URL 중복 등록 | 정규화(트레일링 슬래시·`.git` 접미사 제거, host 소문자화) 후 비교 → 거부 + 기존 자산 링크 제공 |
| 서버 IP+포트 중복 등록 | 동일하게 거부 + 기존 자산 링크 제공 |
| 엑셀 일부 행 오류 | 행 단위 best-effort — 유효 행은 등록, 실패 행은 사유와 함께 결과 테이블 반환 |
| 엑셀 헤더가 템플릿과 다름 | 업로드 전 헤더 검증, 불일치 시 업로드 차단 + 문제 컬럼 안내 |
| 공유링크 비밀번호 반복 오답 | 5회 실패 시 15분 잠금 (IP+토큰 조합 기준) |
| 공유링크 토큰 자체가 틀림 | 404 (토큰 존재 여부 비노출) |
| 프로젝트 삭제 시 소속 자산 | 자산은 삭제하지 않고 자동으로 "미분류"로 이동 |
| 진행 중인 run이 있는 자산 삭제 시도 | 삭제 차단 + 안내 메시지 |
| SSH 자격증명 노출 방지 | `encrypted_secret`은 API 응답/로그/Claude 전달 payload에 절대 평문 포함 안 함 (기존 sanitizer 정책과 동일 기조) |

## 테스트 전략

**단위 테스트**
- 레포 URL 정규화 & dedupe
- 서버 dedupe (`host_ip`+`ssh_port`)
- 엑셀 파서 (정상/필수값 누락/잘못된 타입 행)
- 공유링크 토큰 생성 및 비밀번호 해시 검증
- rate limit 카운터 (5회 실패 → 잠금)
- `encrypted_secret` 암복호화 라운드트립

**통합 테스트**
- 프로젝트 생성 → 자산 등록(수동) → 프로젝트 필터링 확인
- 엑셀 업로드 → 성공/실패 혼합 → 결과 리포트 검증
- 자산 선택 → run 실행 → run 이력에 `asset_id` 연결 확인
- 프로젝트 삭제 → 소속 자산이 미분류로 이동
- 자산 삭제(hard delete) → 연결된 run cascade 삭제 확인
- 진행 중인 run이 있는 자산 삭제 시도 → 차단 확인
- `/share/[token]` — 올바른 비번으로 해당 프로젝트만 노출, 다른 프로젝트는 비노출
- 틀린 비번 5회 → 잠금 확인

## 로드맵 컨텍스트 (참고용, 이번 스코프 아님)

- **A2**: 서버 자산에 대한 실제 SSH/Ansible 점검 실행 엔진 (자격증명은 A1에서 이미 암호화 저장됨을 전제)
- **B**: 컴플라이언스 프레임워크 일반화 (현재 KISA 가이드 단일 축 → 여러 프레임워크 지정 가능한 구조)
- **C**: 점검 스케줄링 (사용자 요청 vs 주기적 점검 구분)
- **D**: CVE 실시간 감시 파이프라인 (NVD 실시간 폴링 + AI 영향 자동 분석)
