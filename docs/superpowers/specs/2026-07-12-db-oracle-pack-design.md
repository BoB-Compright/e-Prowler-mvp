# DB — Oracle 벤더 팩 (#3c) 설계

> 작성일: 2026-07-12
> 상태: 승인됨(로드맵 사전 승인) → 구현 계획 대기
> 전제: 벤더 팩(#0)·AI 판정(#2a)·MySQL(#3)·PostgreSQL(#3b) 병합됨. DB 팩과 동형.

## 목표

CIS Oracle Database Benchmark 기준으로 Oracle을 점검하는 `db-oracle` 팩(ORA-01~12)을 추가한다.
Oracle CIS의 상당수는 SQL(v$parameter, dba_users)·바이너리 spfile 기반이라, SSH-쉘로 확인 가능한
**파일권한·프로세스·listener.ora/sqlnet.ora 설정** 항목만 pass/fail로 하고, SQL/spfile 의존 항목은
review(#2a AI가 버전 흡수, 나머지 수동)로 둔다.

## 아키텍처

- `src/lib/catalog/data/cis/db.json`에 **ORA-01~12 추가**(같은 DB 카탈로그 파일; `category:"db"`,
  `frameworkId:"cis"`). 불확실 항목 `(항목 확인 필요)`. index.ts 변경 불필요(db 소스 기존).
- 신규 `src/lib/packs/dbOracle.ts` — `dbOraclePack`(category `DB`, vendors `["Oracle"]`, executionPath
  linux, itemIds=**ORA-*** 프리픽스 필터, evidenceTasks, detect, evaluate).
- **벤더 분리:** DB 카탈로그에 DB-*(MySQL)·PG-*(PostgreSQL)·ORA-*(Oracle) 공존. db-oracle itemIds는
  `startsWith("ORA-")`만. (db-mysql=DB-*, db-postgresql=PG-*는 기존대로.)
- `registry.ts` `ALL_PACKS`에 등록. `findVendorPack("DB","Oracle")` 매칭.

## 증거 수집 (Oracle 고유)

ORACLE_HOME/TNS_ADMIN 해석 후 네트워크 설정 파일·권한·프로세스.

| 태스크명 | 수집 내용 |
|---|---|
| `oracle detection (internal)` | `tnslsnr`/`sqlplus`/`oracle` 바이너리 또는 listener.ora/oratab 존재 → `present` / `absent` |
| `oracle listener.ora (internal)` | TNS_ADMIN 또는 표준 경로(`/opt/oracle/.../network/admin`, `/u01/.../network/admin`, `$ORACLE_HOME/network/admin`)의 listener.ora concat |
| `oracle sqlnet.ora (internal)` | 위 경로의 sqlnet.ora concat |
| `oracle init pfile (internal)` | init*.ora(텍스트 pfile) concat(있으면) — spfile(바이너리)은 제외 |
| `oracle home perms (internal)` | ORACLE_HOME(또는 표준 경로) stat |
| `oracle listener.ora perms (internal)` | listener.ora stat |
| `oracle process user (internal)` | `ps`로 tnslsnr/pmon 실행 계정 |
| `oracle version (internal)` | `sqlplus -V`/`tnslsnr version` |

## 항목별 판정 (ORA-01~12, review 최소화)

| 항목 | 판정 | CIS Oracle 근거(요지) |
|---|---|---|
| ORA-01 ORACLE_HOME 권한 | pass/fail | group/other 쓰기 없음, oracle 소유 |
| ORA-02 전용 비특권 계정 구동 | pass/fail | process user가 root 아님(oracle 등) |
| ORA-03 listener.ora 권한 | pass/fail | group/other 쓰기 없음 |
| ORA-04 리스너 관리 제한 | pass/fail | listener.ora에 `ADMIN_RESTRICTIONS_<listener>=ON` |
| ORA-05 외부 프로시저(extproc) 노출 제한 | pass/fail | listener.ora에 extproc 등록이 없음(또는 제한) |
| ORA-06 네트워크 인증 서비스 제한 | pass/fail | sqlnet.ora `SQLNET.AUTHENTICATION_SERVICES` 적정(예: (NONE) 또는 명시) |
| ORA-07 네트워크 암호화 | pass/fail | sqlnet.ora `SQLNET.ENCRYPTION_SERVER` 설정 |
| ORA-08 리스너 로깅 | pass/fail | listener.ora `LOGGING_<listener>` 미off / 로그 설정 |
| ORA-09 감사(audit) 파라미터 | pass/fail(pfile) / review | init pfile에 `audit_trail`이 none 아님 → 양호; pfile 없음(spfile) → review |
| ORA-10 remote_login_passwordfile | pass/fail(pfile) / review | init pfile `remote_login_passwordfile`가 NONE/EXCLUSIVE 적정; pfile 없음 → review |
| ORA-11 기본 계정/권한 관리 | review | 라이브 SQL(dba_users) 필요 — 수동 |
| ORA-12 버전/패치 | review | 버전 evidence 노출(#2a AI 흡수) |

정확한 경계값·정규식은 플랜에서 확정. listener.ora/sqlnet.ora는 대소문자 무시 key=value/괄호 구문,
init pfile은 `param = value` 텍스트.

## 실행 경로 / E2E 검증

- **최선노력 실제점검:** Docker Oracle-XE(예: gvenzl/oracle-xe) 기동을 시도해 `DB/Oracle` 자산으로 실제
  점검. 이 환경에서 컨테이너가 안 뜨면(용량·라이선스·아키텍처 제약) **실제점검은 보류**하고(#4 Windows와
  동일 취급) 단위 테스트(fixture)로 로직을 보장, 실제점검은 "Oracle 대상 확보 시"로 표시.
- positive(가능 시): os-unix + db-oracle, U-* + ORA-* 실제 pass/fail/review.
- negative: ORA-* 전부 review. 벤더 분리(ORA-*만) 확인.

## 테스트 전략

- 단위: 각 평가기 listener.ora/sqlnet.ora/pfile 스니펫·stat·process 경계값. registry(DB/Oracle→db-oracle).
  resolve(server+DB/Oracle → os-unix+db-oracle). 카탈로그 db 36항목(DB/PG/ORA 각 12)+CIS. **db-oracle itemIds가
  ORA-*만, 타 DB 팩 불변.**
- 통합: 팩 evidence/evaluate, 미탐지→review.
- 실제 흐름 verify: (가능 시) Docker Oracle-XE; 불가 시 보류 표시 + 단위 커버리지.

## 다루지 않는 것

- 라이브 SQL·바이너리 spfile 파싱(ORA-09/10 pfile 없으면 review, ORA-11 review). Windows(#4).
