# DB — MySQL/MariaDB 벤더 팩 (#3) 설계

> 작성일: 2026-07-12
> 상태: 승인됨(브레인스토밍) → 구현 계획 대기
> 전제: 벤더 팩(#0)·AI 판정(#2a)·Apache(#1)·Tomcat(#2) 모두 main 병합됨.

## 목표

CIS MySQL Benchmark 기준으로 MySQL/MariaDB를 점검하는 `db-mysql` 팩(vendors: MySQL, MariaDB)과
DB(CIS) 카탈로그를 추가한다. 자산은 SSH 접속만 갖고 DB 계정은 없으므로 **설정파일(my.cnf)·파일권한·
프로세스 기반** 점검을 하고(라이브 SQL 미사용), SQL이 꼭 필요한 항목만 review로 남긴다(#2a AI가
버전 등 흡수, 익명계정 등 SQL-필수는 정직하게 수동 review).

## 아키텍처

- 신규 `src/lib/catalog/data/cis/db.json` — DB-01~12, `frameworkId:"cis"`, `category:"db"`(#0). 불확실
  CIS 항목번호는 `(항목 확인 필요)`. `CATALOG_SOURCES`에 `{ frameworkId:"cis", category:"db", data }` 추가.
- 신규 `src/lib/packs/dbMysql.ts` — `dbMysqlPack: VendorPack`(category `DB`, vendors `["MySQL","MariaDB"]`,
  executionPath linux, itemIds=`getCatalogByCategory("db")`, evidenceTasks, detect, evaluate).
- `registry.ts` `ALL_PACKS`에 등록. `findVendorPack("DB","MySQL")`·`("DB","MariaDB")` 모두 매칭(대소문자 무시).
- 순수 추가: 선택 엔진/오케스트레이터/serverScan/기존 팩 수정 없음(카탈로그 소스 1줄 + registry 1줄 제외).
- 미탐지/review는 엔진(#0)·AI 판정(#2a)이 처리. 평가기는 DB 존재 전제.

## 증거 수집 (MySQL/MariaDB 고유)

my.cnf 계열은 여러 위치에 분산되므로 존재하는 것만 concat. Debian/Ubuntu(mysql/mariadb)와 RHEL 레이아웃 모두.

| 태스크명 | 수집 내용 |
|---|---|
| `mysql detection (internal)` | `mysqld`/`mariadbd`/`mysql` 바이너리 또는 my.cnf 존재 → `present` / `absent` |
| `mysql config (internal)` | 존재하는 설정 concat: `/etc/mysql/my.cnf`, `/etc/mysql/mysql.conf.d/*.cnf`, `/etc/mysql/mariadb.conf.d/*.cnf`, `/etc/my.cnf`, `/etc/my.cnf.d/*.cnf` |
| `mysql datadir perms (internal)` | 설정의 `datadir`(기본 `/var/lib/mysql`) stat |
| `mysql conf perms (internal)` | 주 설정 파일(my.cnf) stat |
| `mysql process user (internal)` | `ps`로 mysqld/mariadbd 실행 계정 |
| `mysql version (internal)` | `mysqld --version`/`mariadbd --version` |

## 항목별 판정 (DB-01~12, review 최소화)

| 항목 | 판정 | CIS MySQL 근거(요지) |
|---|---|---|
| DB-01 데이터 디렉터리 권한 | pass/fail | datadir이 group/other 접근 없이 DB 계정 소유 |
| DB-02 전용 비특권 계정 구동 | pass/fail | process user가 root 아님(mysql/mariadb 등 전용 계정) |
| DB-03 설정 파일 권한 | pass/fail | my.cnf가 world-writable 아님 |
| DB-04 에러 로그 설정 | pass/fail | `log_error`/`log-error`가 설정됨 |
| DB-05 심볼릭 링크 비활성 | pass/fail | `symbolic-links=0` 또는 `skip-symbolic-links` |
| DB-06 LOAD DATA LOCAL 비활성 | pass/fail | `local-infile=0` / `local_infile=OFF` |
| DB-07 SSL/TLS 사용 | pass/fail | `require_secure_transport=ON` 또는 `ssl-cert`/`ssl_cert` 설정 |
| DB-08 네트워크 노출 제한 | pass/fail | `bind-address`가 0.0.0.0 아님 또는 `skip-networking` |
| DB-09 secure_file_priv 설정 | pass/fail | `secure_file_priv`가 설정됨(빈 문자열 아님) |
| DB-10 비밀번호 검증/인증 플러그인 | pass/fail | my.cnf에 `validate_password.*` 또는 안전한 `default_authentication_plugin` 설정 |
| DB-11 익명/테스트 계정 제거 | review | 라이브 SQL(SELECT user FROM mysql.user) 필요 — 수동 확인 |
| DB-12 버전/패치 | review | 버전만으로 패치 단정 불가 — 버전을 evidence로 노출(#2a AI 흡수) |

정확한 경계값·정규식은 플랜에서 코드로 확정. review는 DB-11(SQL 필수)·DB-12(버전).

## 실행 경로 / E2E 검증

- 컨테이너에 mysql-server 또는 mariadb-server 설치 후 `DB/MySQL`(또는 MariaDB) 자산으로 실제 점검.
- positive(설치): U-*(os-unix 베이스라인) + DB-*가 실제 pass/fail/review.
- negative(미설치): DB-* 전부 `review`("선언된 MySQL/MariaDB 미확인").
- OS 베이스라인 병존. 실제 프로덕션 경로(resolveCheckPlan→합성 플레이북→evaluatePlan)로 검증.

## 테스트 전략

- **단위:** 각 평가기 my.cnf 스니펫·stat·process 경계값 fixture(양호/취약/review). registry(DB/MySQL·MariaDB
  → db-mysql). resolve(server+DB/MySQL → os-unix+db-mysql, evidence에 mysql 탐지 포함). 카탈로그 db 12항목+CIS.
- **통합:** 팩 evidenceTasks/evaluate 노출, evaluatePack 미탐지→review.
- **실제 흐름 verify:** Docker mysql/mariadb 대상 positive/negative/OS 병존, 재실행.

## 다루지 않는 것

- 라이브 SQL 질의(DB 계정 수집) — DB-11 등은 review. 후속 기능 후보.
- PostgreSQL/Oracle(후속 사이클 #3b/#3c).
- 선택 엔진/오케스트레이터/기존 팩 수정.
