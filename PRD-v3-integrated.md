# e-Prowler — 자산 중심 보안 점검 플랫폼 (통합 PRD v3)

**작성일:** 2026-07-09
**문서 성격:** 현재 구현 상태를 반영한 통합 제품 명세. 초기 해커톤 PRD(`PRD.md`, v2 Revised, 7/1)와 이후 확장 기능(A1·A2·B·C·D) 설계 문서 6종을 하나의 "현재 시점 제품 전체 그림"으로 재작성한 것이다.
**대체 관계:** `PRD.md`(v2)는 초기 컨테이너 점검 파이프라인 시점의 문서로, 자산/서버/스케줄/CVE/대시보드 확장이 반영돼 있지 않다. 이 문서가 현행 기준이며, `PRD.md`는 히스토리로 보존한다.
**한 줄 요약:** 레포·서버 자산을 등록해 KISA 가이드 기반 보안 점검을 자동 실행하고, 정기 점검·CVE 감시·프로젝트별 PM 공유까지 자산 중심으로 통합 관리하는 보안 점검 플랫폼.

---

## 0. 이 문서가 통합하는 범위

초기 PRD(v2)는 "GitHub 레포 → Docker 빌드 → Sandbox → Ansible 점검 → Claude 분석 → Dashboard"의 **단건 컨테이너 점검 파이프라인**이었다. 이후 다음 5개 서브 프로젝트가 순차 구현되어 제품의 중심 축이 **자산(Asset)**으로 이동했다:

| 코드 | 이름 | 핵심 추가 |
|---|---|---|
| A1 | 자산 관리 + 프로젝트 그룹핑 | 레포/서버 자산 영속화, 프로젝트 단위 묶음, PM 공유링크, 엑셀 업로드 |
| A2 | SSH 점검 실행 엔진 | 서버 자산을 실제 SSH로 점검(단건 + 프로젝트 fleet scan) |
| B | 컴플라이언스 프레임워크 일반화 | 카탈로그를 프레임워크 축으로 일반화(현재 KISA 1개, 확장 구조) |
| C | 점검 스케줄링 | 자산별 정기 점검(매일/매주/매월), 재기동 캐치업 |
| D | CVE 실시간 감시 | 서버 설치 패키지를 NVD와 대조해 신규 CVE 조기 포착 |
| UX | 자산 중심 UX 정합화 | 홈을 보안 현황 대시보드로, 자산 상세를 점검·이력·스케줄·CVE 허브로 |

**KISA 표현 원칙(v2에서 유지):** "KISA 판정"이라는 표현은 쓰지 않는다. KISA가 직접 시스템을 판정하는 것으로 오해될 수 있기 때문이다. 이 시스템의 평가 결과는 "KISA 가이드 기반 점검 항목"을 정적 카탈로그로 정리하고 Ansible evidence에 내부 룰을 적용해 산출한 결과다.

---

## 1. 문제 정의

**보안 담당자의 현실:**
- 여러 프로젝트에 걸친 레포·서버 자산의 보안 설정을 수동으로, 사람마다·시점마다 다른 기준으로 점검하고 있음
- Dockerfile 하드닝, 실행 컨테이너 baseline, 서버 OS/Web baseline을 각각 따로 확인해 느리고 누락이 잦음
- 점검 결과(raw 로그) 해석과 개선안 정리에 시간이 많이 듦
- 한 번 점검하고 끝 — 정기적 재점검이나 신규 CVE 발생 감시가 안 됨
- 점검 결과를 프로젝트 담당 PM에게 전달할 표준 경로가 없음

**해결:** 자산을 한 번 등록해두면, 그 자산에 대한 점검 실행·이력·정기 스케줄·CVE 감시가 자산 단위로 누적되고, 프로젝트로 묶어 PM에게 공유링크로 전달할 수 있다. 모든 것이 하나의 대시보드에서 조망된다.

---

## 2. 핵심 사용자 (페르소나)

- **주 사용자 — 보안 담당자:** 여러 프로젝트의 레포/서버 자산을 등록·점검·관리하고, 결과를 해석해 개선안을 도출한다. 앱을 열면 대시보드에서 전체 보안 현황을 조망한다.
- **보조 사용자 — 프로젝트 PM:** 공유링크(URL+비밀번호)로 자기 프로젝트의 점검 결과만 읽기 전용으로 열람한다. 계정/세션 없음.

---

## 3. 핵심 기능

### F1. 자산 관리 + 프로젝트 그룹핑 (A1)
- 레포 자산(GitHub URL) / 서버 자산(host IP·SSH 인증정보) 등록·조회·삭제
- 수동 등록 폼 + 엑셀 일괄 업로드(레포 시트 / 서버 시트, 행별 best-effort)
- 프로젝트 CRUD + PM 연락처 + 공유링크 발급/재발급
- 자산을 프로젝트로 그룹핑(미분류 허용)
- 서버 자산의 SSH 자격증명은 AES-256-GCM(`INFRA_SECURITY_MASTER_KEY`)으로 암호화 저장, 응답·로그·AI payload에 평문 노출 금지
- 중복 방지: 레포는 정규화 URL, 서버는 `host_ip`+`ssh_port` 조합

### F2. 컨테이너(레포) 점검 파이프라인 (v2 기반)
`clone → build → sandbox → ansible → rule_eval → claude → done` 6단계. GitHub clone/Docker build 실패 시 **로컬 이미지 재점검(fallback)**으로 sandbox부터 재개(대시보드 하단 접이식 섹션).

### F3. 서버(SSH) 점검 실행 엔진 (A2)
- 서버 자산 단건 점검: `connect → ansible_scan → rule_evaluation → claude_analysis → done` (4+1단계)
- 프로젝트 단위 **fleet scan**(최대 5대 동시, 실패 격리 — 한 서버 실패가 배치 전체를 중단시키지 않음)
- 인증: 비밀번호(paramiko, extra-var 전달) / 키(복호화 → 0600 임시파일 → 실행 후 즉시 삭제)
- 연결 실패만 재시도(30초 간격 3회), 인증 실패는 즉시 실패(자격증명 노출 없이 "인증 실패"만 기록)

### F4. 컴플라이언스 프레임워크 (B)
- 점검 항목 카탈로그를 **프레임워크 축**으로 일반화. 현재 KISA 가이드 1개 등록
- 새 프레임워크 추가 = JSON 데이터 파일 + 레지스트리 등록만으로 가능(로더 로직 무변경)
- 카탈로그 총 **102개 항목**: 컨테이너/이미지 하드닝 C-01~C-09(9) + KISA Unix U-01~U-67(67) + KISA 웹서비스 WEB-01~WEB-26(26)

### F5. 점검 스케줄링 (C)
- 자산별 정기 점검: 매일 / 매주(요일 지정) / 매월(날짜 지정, 월말 클램프) + on/off
- in-process 스케줄러(`setInterval` 1분, 외부 큐/cron 불필요), 서버 부팅 시 `instrumentation.ts`에서 기동
- 재기동 캐치업: "due = `next_run_at <= now`" 조건이라 꺼져 있던 동안 놓친 스케줄이 재기동 즉시 체크에서 자연히 실행됨
- 진행 중 run과 충돌 시 skip + 사유 기록. run에 트리거 출처(수동/예약) 기록

### F6. CVE 실시간 감시 (D)
- 서버 자산의 설치 패키지를 24시간 주기로 SSH 재수집(`rpm`/`dpkg` 분기)
- 패키지명으로 NVD `keywordSearch` → 설치 버전과 휴리스틱 대조 → 매칭 CVE를 `cve_matches`에 upsert
- 신규 매칭 중 CVSS ≥ 7.0(High/Critical)만 Claude로 한국어 영향/조치 분석
- NVD 레이트리밋 준수(요청 간 6.5초, 프로세스 전역 리미터 1개), 24시간 캐시 + 장애 시 캐시 폴백
- 사용자가 오탐 CVE "무시" 처리(데이터 보존, 화면에서만 접힘)

### F7. 자산 중심 대시보드 & 허브 (UX)
- **홈 대시보드(`/`)**: 지표 카드 4장(총 자산 / 취약 자산 / 미해결 CVE / 활성 스케줄) + 위험 CVE Top5 + 자산별 보안 현황 테이블 + 최근 점검 활동 피드
- **자산 상세 = 허브(`/assets/[id]`)**: 점검 시작 버튼 + 정기 점검 설정 + (서버) 감지된 CVE + 점검 이력(배지·리포트 링크) + 소속 프로젝트 링크
- 점검 진입점을 자산 상세로 통일("점검 실행" 탭 제거)

### F8. AI 분석 (v2 기반)
Ansible evidence + 룰 평가 결과를 입력받아 취약점 설명·위험도·판정 근거·조치방안(remediation)·설정 예시를 한국어로 생성. Claude가 점검 기준을 임의 생성하거나 판정을 대체하지 않음. 입력 전 민감정보 sanitize. `CLAUDE_ANALYSIS_ENABLED` 환경변수로 게이트(토큰 절약).

---

## 4. 점검 결과 상태값 (v2에서 유지)

| 내부 status | UI 표시 | 의미 |
|---|---|---|
| `pass` | 양호 | 명확한 증거로 기준을 만족 |
| `fail` | 취약 | 명확한 증거로 기준을 위반 |
| `review` | 검토 | 증거 부족/환경 의존으로 자동 평가 어려움 |
| `skip` | 제외/해당 없음 | 대상에 해당 파일·서비스가 없어 점검 대상 아님 |
| `not_automated` | 자동화 전 | 카탈로그엔 있으나 MVP 자동 점검 대상 아님 |

원칙: `skip`은 실패 아님 · `review`는 수동 확인 필요 상태 · 명확한 evidence가 있으면 `review`보다 `pass`/`fail` 우선 · 자동화 전 항목은 취약점 통계 제외.

**run 수준 outcome:** `fail`(취약) / `review`(검토) / `pass`(양호). 단, `status=failed`인 run(파이프라인 실패)은 check 결과가 없어 outcome을 계산하지 않고 "실패"로 별도 표시한다. `running`은 "진행 중".

**CVE 심각도:** NVD 기준 소문자(`critical`/`high`/`medium`/`low`/`unknown`) — 점검 심각도(대문자 `Critical`/`High`/…)와 별개 도메인.

---

## 5. 데이터 모델 (현행)

| 테이블 | 역할 | 주요 필드 |
|---|---|---|
| `projects` | 프로젝트 + PM + 공유링크 | `name`, `pm_name`, `pm_email`, `share_token`, `share_password_hash`, `share_failed_attempts`, `share_locked_until` |
| `assets` | 레포/서버 자산 | `type`(repo\|server), `project_id`(nullable=미분류), `display_name`, `repo_url` / `host_ip`·`hostname`·`ssh_port`·`auth_type`·`username`·`encrypted_secret` |
| `runs` | 점검 실행 | `source_type`(git\|local_image\|server), `stage`, `status`, `asset_id`, `batch_id`, `trigger_type`(manual\|scheduled) |
| `run_events` | 단계별 이벤트 로그 | `run_id`, `stage`, `status`, `message` |
| `check_results` | 항목별 점검 결과 | `run_id`, `item_id`, `status`, `evidence` |
| `analysis_reports` | AI 분석 결과 | `run_id`, `item_id`, `title`, `reason`, `remediation`, `example` |
| `scan_batches` | fleet scan 묶음 | `project_id` |
| `schedules` | 자산별 정기 점검 | `asset_id`(UNIQUE), `frequency`, `day_of_week`, `day_of_month`, `time_of_day`, `enabled`, `next_run_at`, `last_run_at`, `last_skip_reason` |
| `installed_packages` | 서버 설치 패키지 스냅샷 | `asset_id`, `name`, `version`, `collected_at` |
| `cve_matches` | 자산×CVE 매칭 | `asset_id`, `cve_id`, `cvss_score`, `severity`, `summary`, `first_seen_at`, `checked_at`, `dismissed`, `ai_impact`, `ai_remediation` |
| `nvd_query_cache` | NVD 응답 캐시(TTL 24h) | `package_name`(PK), `raw_response`, `fetched_at` |

**Cascade 정책:** SQLite FK cascade에 의존하지 않고 `deleteAsset`의 명시적 트랜잭션이 자식(`schedules`/`installed_packages`/`cve_matches`/`run_events`/`check_results`/`analysis_reports`/`runs`)을 먼저 지운다. 진행 중 run이 있는 자산은 삭제 차단. 프로젝트 삭제 시 소속 자산은 삭제하지 않고 미분류로 이동.

---

## 6. 화면 구성 (현행 네비게이션 5탭)

| 탭 / 경로 | 역할 |
|---|---|
| **대시보드** `/` | 자산 전체 보안 현황(지표·위험 CVE·자산 현황·활동 피드) + 로컬 이미지 재점검 폴백 |
| **자산** `/assets`, `/assets/new`, `/assets/upload`, `/assets/[id]` | 자산 목록/등록/엑셀 업로드/상세(허브) |
| **프로젝트** `/projects`, `/projects/[id]` | 프로젝트 관리 + fleet scan 트리거 |
| **점검 이력** `/runs`, `/runs/[id]`, `/runs/[id]/report`, `/runs/batch/[batchId]` | 실행 목록/진행 상태/상세 리포트/배치 결과 |
| **카탈로그** `/catalog` | 프레임워크별 점검 항목 카탈로그(참조용) |
| (탭 외) `/share/[token]` | PM용 읽기전용 프로젝트 뷰(비밀번호 보호) |

---

## 7. 성공 기준 (시연)

**A. E2E 자동 파이프라인**
- 레포 자산: 자산 등록 → 점검 시작 → clone~done 자동 진행 → 리포트에서 양호/취약/검토 + AI 분석 확인
- 서버 자산: 자산 등록(SSH 인증) → 점검 시작 → connect~done → 리포트 확인
- fleet scan: 프로젝트의 서버들을 일괄 점검, 배치 결과 페이지에서 개별 run 확인
- 폴백: clone/build 불가 상황에서 로컬 이미지로 재점검 재개

**B. 자산 중심 관리 흐름**
- 대시보드에서 전체 보안 현황 조망 → 자산 클릭 → 허브에서 점검/스케줄/CVE/이력 확인
- 자산에 정기 점검 등록 → 서버 재기동 후 due 스케줄 자동 실행 확인
- 서버 자산에서 감지된 CVE + AI 영향분석 확인, 오탐 무시
- 프로젝트 공유링크를 PM에게 전달 → PM이 비번 입력 후 해당 프로젝트만 열람

**C. AI 분석 품질**
- 명확한 evidence 항목은 `review`로 도피하지 않고 `양호`/`취약` 판정
- 조치방안·설정 예시가 실무에 바로 쓸 수준

---

## 8. 기술 스택

- **프론트/백:** Next.js 16 App Router / React 19 / TypeScript strict
- **DB:** better-sqlite3 (단일 파일, 로컬 단일 프로세스 전제)
- **스타일:** Tailwind v4 + `var(--color-*)` CSS 변수 (Coinbase 톤 디자인 토큰)
- **점검 엔진:** Ansible(`ansible-runner`), Docker SDK(sandbox), paramiko/ssh(서버)
- **AI:** Claude API (`@anthropic-ai/sdk`)
- **외부 연동:** NVD API(CVE), GitHub(PAT clone)
- **백그라운드:** `instrumentation.ts`에서 스케줄러(C) + CVE 폴러(D) 기동 (외부 큐/cron 없이 in-process interval)
- **테스트:** Vitest (현행 전체 1054개 통과)

---

## 9. 제외 범위 (현재도 안 하는 것)

- GitHub Webhook 기반 자동 점검, CI/CD 직접 연동
- 이메일 등 외부 알림(결과는 대시보드/공유링크에서만 확인)
- 계정/세션 기반 인증(PM은 공유링크+비번만), 조직/권한 관리, OAuth
- 자유 형식 cron 표현식(프리셋만), 프로젝트 단위 일괄 스케줄(스케줄은 자산 단위)
- 정확한 NVD CPE 사전 매칭(키워드 휴리스틱만), 레포/컨테이너 자산의 CVE 지속 감시(스냅샷 특성상 서버만)
- 다중 인스턴스/다중 타임존 배포(단일 로컬 프로세스 전제)
- Kubernetes 점검, 자동 보안 패치 적용
- 대시보드 실시간 자동 갱신(새로고침 기반), 모바일 반응형

---

## 10. 로드맵 히스토리

`A1(자산) → A2(SSH 점검) → C(스케줄링) → D(CVE 감시)` 순으로 구현됐고, `B(프레임워크 일반화)`와 `UX(자산 중심 정합화)`가 병행/후속으로 병합됐다. B는 원래 A2 다음 순서였으나 사용자 판단으로 C를 먼저 진행하고 나중에 병합했다. 각 단계의 상세 설계·구현 계획은 `docs/superpowers/specs/` 및 `docs/superpowers/plans/`에 서브 프로젝트별로 보존돼 있다.

> **참고:** 이 확장 로드맵(A1~D)은 초기 해커톤 PRD(`PRD.md`)의 "제외 범위"에 있던 항목들(실시간 CVE DB 연동, 스케줄링 등)과 의도적으로 겹치는 스코프 확장이다. 각 단계마다 사용자 승인 후 진행됐다.
