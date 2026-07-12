# DB — PostgreSQL 벤더 팩 (#3b) 설계

> 작성일: 2026-07-12
> 상태: 승인됨(로드맵 사전 승인) → 구현 계획 대기
> 전제: 벤더 팩(#0)·AI 판정(#2a)·MySQL(#3) 모두 main 병합됨. MySQL 팩과 동형 구조.

## 목표

CIS PostgreSQL Benchmark 기준으로 PostgreSQL을 점검하는 `db-postgresql` 팩을 추가한다(기존 DB(CIS)
카탈로그에 PG-01~12 추가). 설정파일(postgresql.conf, pg_hba.conf)·파일권한·프로세스 기반(라이브 SQL
미사용). review는 최소화(PG-11 SQL 필수·PG-12 버전만), #2a AI가 흡수.

## 아키텍처

- `src/lib/catalog/data/cis/db.json`에 **PG-01~12 추가**(기존 DB-01~12와 같은 파일; `category:"db"`,
  `frameworkId:"cis"`). 불확실 CIS 항목번호는 `(항목 확인 필요)`. (카탈로그 등록은 이미 db 소스가 있어
  파일 항목만 늘어남 — index.ts 변경 불필요.)
- 신규 `src/lib/packs/dbPostgres.ts` — `dbPostgresPack`(category `DB`, vendors `["PostgreSQL"]`,
  executionPath linux, itemIds=**PG-** 항목들만, evidenceTasks, detect, evaluate).
- **주의(중요):** DB 카탈로그에 이제 MySQL(DB-*)과 PostgreSQL(PG-*)이 공존한다. 각 DB 팩의 `itemIds`는
  자기 벤더 항목만 가져야 한다(db-mysql=DB-*, db-postgresql=PG-*). `getCatalogByCategory("db")` 전체가
  아니라 **id 프리픽스로 필터**한다. db-mysql 팩도 이 원칙에 맞게 DB-* 프리픽스로 좁힌다(이번 사이클에서
  db-mysql itemIds를 `getCatalogByCategory("db").filter(id startsWith "DB-")`로 수정 — 안 그러면 MySQL 팩이
  PG 항목까지 평가 대상으로 삼아 결과가 틀어진다).
- `registry.ts` `ALL_PACKS`에 `dbPostgresPack` 등록. `findVendorPack("DB","PostgreSQL")` 매칭.

## 증거 수집 (PostgreSQL 고유)

Debian(`/etc/postgresql/<ver>/main/`)·RHEL(`/var/lib/pgsql/data/`) 레이아웃.

| 태스크명 | 수집 내용 |
|---|---|
| `postgres detection (internal)` | `postgres`/`postmaster` 바이너리 또는 postgresql.conf 존재 → `present` / `absent` |
| `postgresql.conf (internal)` | 존재하는 postgresql.conf concat: `/etc/postgresql/*/main/postgresql.conf`, `/var/lib/pgsql/*/data/postgresql.conf`, `/var/lib/postgresql/*/main/postgresql.conf`, `/var/lib/pgsql/data/postgresql.conf` |
| `pg_hba.conf (internal)` | 위 대응 경로의 pg_hba.conf concat |
| `postgres datadir perms (internal)` | data_directory(기본 위 경로) stat |
| `postgres conf perms (internal)` | postgresql.conf stat |
| `postgres process user (internal)` | `ps`로 postgres 실행 계정 |
| `postgres version (internal)` | `postgres --version`/`postmaster --version` |

## 항목별 판정 (PG-01~12, review 최소화)

| 항목 | 판정 | CIS PostgreSQL 근거(요지) |
|---|---|---|
| PG-01 데이터 디렉터리 권한 | pass/fail | PGDATA가 group/other 접근 없이 postgres 소유(0700) |
| PG-02 전용 비특권 계정 구동 | pass/fail | process user가 root 아님(postgres 등) |
| PG-03 설정 파일 권한 | pass/fail | postgresql.conf가 group/other 쓰기 없음 |
| PG-04 로깅 수집 활성 | pass/fail | `logging_collector = on` |
| PG-05 네트워크 노출 제한 | pass/fail | `listen_addresses`가 `*`가 아님(localhost 또는 특정 IP) |
| PG-06 SSL/TLS 활성 | pass/fail | `ssl = on` |
| PG-07 pg_hba 신뢰 인증 금지 | pass/fail | pg_hba.conf에 `trust` 메서드 없음(비-로컬 라인) |
| PG-08 안전한 비밀번호 암호화 | pass/fail | `password_encryption = scram-sha-256` |
| PG-09 접속 로깅 | pass/fail | `log_connections = on` |
| PG-10 접속 종료 로깅 | pass/fail | `log_disconnections = on` |
| PG-11 슈퍼유저/과다 권한 역할 | review | 라이브 SQL(pg_roles) 필요 — 수동 |
| PG-12 버전/패치 | review | 버전을 evidence로 노출(#2a AI 흡수) |

정확한 경계값·정규식은 플랜에서 확정. postgresql.conf 값은 `key = value`(따옴표·불리언 on/off),
pg_hba.conf는 공백 구분 5필드(TYPE DATABASE USER ADDRESS METHOD).

## 실행 경로 / E2E 검증

- 컨테이너에 postgresql 설치 후 `DB/PostgreSQL` 자산으로 실제 점검.
- positive: os-unix + db-postgresql, U-* + PG-* 실제 pass/fail/review.
- negative(미설치): PG-* 전부 review. OS 베이스라인 병존.
- **db-mysql/db-postgresql 분리 확인:** MySQL 자산은 DB-*만, PostgreSQL 자산은 PG-*만 나오는지(itemIds 프리픽스 필터).

## 테스트 전략

- 단위: 각 평가기 postgresql.conf/pg_hba.conf 스니펫·stat·process 경계값. registry(DB/PostgreSQL→db-postgresql).
  resolve(server+DB/PostgreSQL → os-unix+db-postgresql). 카탈로그 db 24항목(DB-*12 + PG-*12)+CIS. **db-mysql
  itemIds가 DB-*로 좁혀졌는지, db-postgresql이 PG-*만인지** 검증.
- 통합: 팩 evidence/evaluate, 미탐지→review.
- 실제 흐름 verify: Docker postgresql positive/negative/OS 병존 + 벤더 분리.

## 다루지 않는 것

- 라이브 SQL(PG-11 등 review). Oracle(#3c). 선택 엔진/오케스트레이터 수정.
