# 벤더별 사전 점검 입력값 프레임워크 + 티베로 팩 (SP1) 설계

날짜: 2026-07-19
상태: 사용자 검토 대기

## 배경 / 문제

현재 벤더 팩(Oracle/MySQL/Apache/Tomcat 등)은 SSH로 서버에 붙어 **표준 경로를 글로빙해 설정파일을
읽는** 방식이라, 자산별 사전 입력값을 받지 않는다. 그러나 국산 상용 제품(Tmax 티베로/JEUS/WebtoB
등)은 (1) 설치·설정 경로가 표준화돼 있지 않고 인스턴스 식별자(TB_SID 등)가 필요하며, (2) 계정 정책·
프로파일 같은 항목은 **DB에 로그인해 시스템 뷰를 쿼리**해야 확인된다. 즉 점검 전 **사전 입력값
(경로·인스턴스·DB 계정·비밀번호 등)** 이 필요하다. 이를 위한 일반 메커니즘과 첫 벤더(티베로)가 없다.

## 결정 (사용자 확정)

- 점검 방식: **설정파일 읽기 + DB 로그인 쿼리 둘 다** 지원.
- 분해: **SP1 = 프레임워크 + 티베로 수직 슬라이스**(이 문서). 이후 **SP2 JEUS(WAS)·SP3 WebtoB(WEB)**
  는 프레임워크 위에 콘텐츠만 얹는 별도 사이클.
- 티베로 점검 항목·입력값은 리서치 초안(아래 §7)으로 작성 → 사용자 검토 후 확정.

## 아키텍처 개요

벤더 팩이 "필요한 사전 입력값"을 **선언**하면, 자산 등록 폼이 동적으로 수집하고, 시크릿은 암호화
저장하며, 스캔이 ansible extra-vars로 전달하고, 팩의 evidence 태스크 raw 명령이 `{{ 변수 }}`로
참조한다(설정파일 읽기 + tbSQL 인증 쿼리 모두 raw 명령 하나로 표현됨 — 새 evidence 타입 불필요).

```
[VendorPack.requiredInputs 선언]
        │  (단일 소스)
        ├──▶ 자산 등록 폼: 벤더 선택 시 입력 필드 동적 렌더 (secret=password 타입)
        ├──▶ 저장: assets.scan_inputs(JSON) — secret은 AES-256-GCM 암호화
        ├──▶ 스캔: scan_inputs → ansible extra-vars(secret은 임시파일 보안 채널)
        │           evidence 태스크 raw가 {{ tibero_config_path }} / {{ tibero_db_pass }} 참조
        └──▶ 카탈로그: 벤더별 "필요 입력값" 노출(경량)
```

## 컴포넌트 / 변경

### 1. 입력 스키마 선언 — `VendorPack.requiredInputs`

`src/lib/packs/types.ts`의 `VendorPack`에 선택 필드 추가:

```ts
export type ScanInputKind = "text" | "path" | "secret";
export interface ScanInputSpec {
  name: string;        // ansible 변수명 = extra-vars 키 (예: "tibero_db_pass")
  label: string;       // 폼 라벨 (예: "DB 비밀번호")
  kind: ScanInputKind; // secret이면 암호화 저장 + password 입력
  required: boolean;
  help?: string;       // 폼 도움말 (예: "SYS 계정 등 DBA 권한 계정")
  placeholder?: string;
}
// VendorPack에 추가:
//   requiredInputs?: ScanInputSpec[];
```

기존 팩은 `requiredInputs` 미선언(=입력 불필요) 그대로 동작(하위호환).

### 2. 데이터 모델 — 자산의 `scan_inputs`

- `assets` 테이블에 `scan_inputs TEXT`(JSON, nullable) 컬럼 추가(멱등 마이그레이션 — 기존 패턴
  `PRAGMA table_info` 가드 + `ALTER TABLE`).
- 저장 형태: `{ "<inputName>": "<value>" }` 맵. **secret kind 값은 AES-256-GCM으로 개별 암호화**
  (기존 `src/lib/crypto`의 SSH secret과 동일 마스터키), 비‑secret은 평문.
- 새 헬퍼 `src/lib/assets/scanInputs.ts`:
  - `encodeScanInputs(specs, rawValues): string` — spec의 kind에 따라 secret만 암호화, JSON 직렬화.
  - `decodeScanInputs(specs, stored): Record<string,string>` — 저장값 파싱, secret 복호화. (스캔·수정
    폼 프리필용. 폼 프리필 시 secret은 마스킹 정책 — §4 참고.)
- 응답·로그·AI 입력에 secret 평문 노출 금지(기존 sanitize 원칙 재사용).

### 3. 스캔 전달 — extra-vars

- `src/lib/pipeline/serverScan.ts`(또는 `resolveCheckPlan` 경유): 자산의 pack에 `requiredInputs`가
  있으면 `decodeScanInputs`로 값을 풀어 **ansible extra-vars 맵에 병합**한다. secret은 기존
  `ansibleRunner`의 임시파일 `--extra-vars @file` 보안 채널로만 전달(CLI·로그 노출 금지).
- 팩의 evidence 태스크 raw 명령은 ansible `{{ name }}` 치환으로 값을 사용한다(예:
  `sh -c 'tbsql -s {{ tibero_db_user }}/{{ tibero_db_pass }}@{{ tibero_tbsid }} ...'`).
- **필수 입력 누락 처리**: 필수 입력이 비어 있으면 그 입력에 의존하는 점검 항목을 `review`로 평가하고
  evidence에 "사전 입력값 미제공(<label>)"을 기록한다(스캔 자체는 중단하지 않음). 팩의 `evaluate`가
  입력 유무를 알 수 있도록 `EvalContext`에 `inputsProvided: Set<string>`(값이 채워진 입력명) 전달.

### 4. 자산 등록·수정 폼 — 동적 필드

- `src/app/assets/new/AssetForm.tsx`: 벤더 선택 시 해당 벤더의 pack `requiredInputs`를 조회해 입력
  필드를 동적 렌더(secret은 `type=password`). 값은 등록 API로 함께 전송.
- 벤더→pack 매핑 조회용 경량 헬퍼(`findVendorPack` 재사용) 또는 pack 레지스트리에서 벤더별
  `requiredInputs`를 노출하는 순수 함수 `getVendorInputSpecs(category, vendor): ScanInputSpec[]`.
- 자산 상세(`/assets/[id]`)에서 입력값 수정 가능. **secret 프리필 정책**: 저장된 secret은 폼에
  평문으로 내려보내지 않고 "설정됨(변경하려면 입력)" placeholder로 표시 — 빈 값으로 저장하면 기존
  secret 유지, 새 값 입력 시 교체(SSH secret 수정과 동일 관례가 있으면 그대로 따름).
- API(`POST /api/assets`, 수정 경로): `scanInputs` 필드 수용 → `encodeScanInputs`로 저장.

### 5. 카탈로그 노출 (경량) + 신규 프레임워크

- **신규 프레임워크 등록**: `src/lib/catalog/frameworks.ts`에 `{ id: "tmax", name: "국산 벤더 하드닝 (Tmax)" }`
  추가. 이 프레임워크가 티베로/JEUS/WebtoB 항목을 담고, 항목 ID는 **제품별 접두**로 명명한다:
  **TB-xx(티베로/DB) · JE-xx(JEUS/WAS) · WT-xx(WebtoB/WEB)**. 카탈로그 데이터는
  `src/lib/catalog/data/tmax/tibero.json`(SP1), 이후 `jeus.json`·`webtob.json`.
- 카탈로그 화면에서 해당 벤더 팩 항목에 "사전 입력값 필요: <라벨 목록>"을 표시(팩 `requiredInputs`
  기반). 신규 화면 없이 기존 카탈로그에 보조 텍스트만.

### 6. 엑셀 일괄 업로드 (SP1 범위 밖)

- 엑셀 업로드로 벤더 입력값까지 받는 건 SP1에서 제외(폼 우선). 후속에서 `server` 시트에 벤더
  입력 컬럼을 추가하는 방식으로 확장. SP1 문서에 "미지원" 명시.

---

## 7. 티베로 팩 콘텐츠 (리서치 초안 — 검토 필요)

> 아래는 Tmax 공식 문서·기술 자료 리서치로 작성한 **초안**이다. 실제 필드명/기본값/시스템 뷰는
> 사용자 검토·환경 확인 후 확정한다. 출처는 문서 끝 참고.

### 7-1. 벤더 등록

- `src/lib/assets/categories.ts`의 `CATEGORY_VENDORS.DB`에 `"Tibero"` 추가.
- 새 팩 `src/lib/packs/dbTibero.ts`, 레지스트리(`ALL_PACKS`) 등록. category `"DB"`, vendors `["Tibero"]`,
  executionPath `"linux"`.

### 7-2. 사전 입력값 (`requiredInputs`)

| name | label | kind | required | 비고 |
|---|---|---|---|---|
| `tibero_home` | 설치 경로(TB_HOME) | path | ✅ | 예: `/home/tibero/tibero7` |
| `tibero_tbsid` | 인스턴스(TB_SID) | text | ✅ | `.tip`·접속 식별자 |
| `tibero_db_user` | DB 계정 | text | ✅ | DBA 권한 계정(예: sys) |
| `tibero_db_pass` | DB 비밀번호 | secret | ✅ | tbSQL 로그인용, 암호화 저장 |
| `tibero_listener_port` | 리스너 포트 | text | ❌ | 미입력 시 프로세스에서 탐지 |

설정파일 경로는 `{tibero_home}/config/{tibero_tbsid}.tip`로 조합.

### 7-3. 점검 항목 (관리자 가이드 기반 확장, TB-01~TB-14)

> 근거: Tibero 7.2.5 관리자 가이드 "사용자 관리와 데이터베이스 보안". **주의: DEFAULT 프로파일이
> 기본적으로 취약**하다(`FAILED_LOGIN_ATTEMPTS=UNLIMITED`, `PASSWORD_LIFE_TIME=UNLIMITED`,
> `PASSWORD_GRACE_TIME=UNLIMITED`) — TB-05/07이 이 기본 취약을 잡는다.

| ID | 항목 | 심각도 | 증거·판정 기준 |
|---|---|---|---|
| TB-01 | 기본 계정 잠금/비밀번호 변경 | High | `DBA_USERS`: SYS·SYSCAT·SYSGIS·OUTLN·SYSBACKUP·TIBERO·TIBERO1·LBACSYS 중 미사용 계정 OPEN 여부 |
| TB-02 | SYS 기본 비밀번호(`tibero`) 사용 | High | `tbsql SYS/tibero@{tbsid}` 로그인 성공 시 취약 |
| TB-03 | 불필요한 DBA 롤 부여 계정 | High | `DBA_ROLE_PRIVS` granted_role='DBA' — SYS 외 부여 계정 검토 |
| TB-04 | 과도한 시스템 특권(ANY 등) | Medium | `DBA_SYS_PRIVS` 위험 특권 부여 계정 |
| TB-05 | 로그인 실패 잠금(FAILED_LOGIN_ATTEMPTS) | High | `DBA_PROFILES`: UNLIMITED이면 취약(권장 ≤5) |
| TB-06 | 계정 잠금 기간(PASSWORD_LOCK_TIME) | Low | `DBA_PROFILES`: 과도히 짧으면 검토 |
| TB-07 | 비밀번호 사용 기간(PASSWORD_LIFE_TIME) | Medium | `DBA_PROFILES`: UNLIMITED이면 취약(권장 ≤90일) |
| TB-08 | 비밀번호 재사용 제한(PASSWORD_REUSE_TIME/MAX) | Medium | `DBA_PROFILES`: 둘 다 UNLIMITED이면 취약 |
| TB-09 | 비밀번호 복잡도 함수(PASSWORD_VERIFY_FUNCTION) | Medium | `DBA_PROFILES`: NULL이면 취약(VERIFY_FUNCTION/VERIFY_FUNCTION2 권장) |
| TB-10 | 세션 수 제한(SESSIONS_PER_USER) | Low | `DBA_PROFILES`: UNLIMITED이면 검토 |
| TB-11 | 감사 활성화(AUDIT_TRAIL) | Medium | 파라미터: NONE이면 취약(DB/DB_EXTENDED/OS 권장) |
| TB-12 | SYS 감사(AUDIT_SYS_OPERATIONS) | Low | 파라미터: N이면 검토(권장 Y) |
| TB-13 | 리스너 원격 접근제어 | Medium | `.tip`: LISTENER REMOTE + LSNR_INVITED_IP/DENIED_IP 설정 유무 |
| TB-14 | 설정파일(`.tip`) 소유자·권한 | Medium | SSH `stat`: 소유자 tibero, 권한 과다(그룹/기타 쓰기) 여부 |

- **증거 태스크(효율)**: 프로파일 항목(TB-05~10)은 `DBA_PROFILES` **한 번 쿼리**로, 계정 항목
  (TB-01/03/04)은 `DBA_USERS`/`DBA_ROLE_PRIVS`/`DBA_SYS_PRIVS` 쿼리로, 감사(TB-11/12)는 파라미터
  조회로, 리스너(TB-13)는 `.tip` 읽기로, 파일권한(TB-14)은 SSH `stat`로, TB-02는 기본계정 로그인
  시도로 수집. 대략 6개 evidence 태스크가 14개 항목을 커버.
- 태스크 구성: (a) SSH로 `.tip` 존재·권한·내용, (b) `tbsql -s {user}/{pass}@{tbsid}`로 시스템 뷰/파라미터
  조회(로그인 실패 시 DB-쿼리 의존 항목은 `review` + "DB 인증 실패"), (c) SYS 기본비번 로그인 시도.
- `detect`: `.tip` 파일 존재 또는 `tbsvr`/`tblistener` 프로세스 존재로 티베로 설치 판별.
- `evaluate`: 위 증거로 항목별 pass/fail/review. 명확한 증거 없으면 `review`.

### 7-4. 프레임워크 명칭 (확정)

기존 KISA/CIS와 별개의 **신규 프레임워크 `국산 벤더 하드닝 (Tmax)`(id `tmax`)** 로 둔다. 항목 ID는
제품별 접두로 명명: **TB(티베로/DB) · JE(JEUS/WAS) · WT(WebtoB/WEB)**. SP1은 TB만, SP2/SP3에서
JE/WT 추가.

---

## 데이터 흐름

1. 등록: 벤더 "Tibero" 선택 → 폼이 5개 입력 렌더 → 저장(secret 암호화).
2. 점검: serverScan이 scan_inputs 복호화 → extra-vars 병합 → ansible이 `.tip` 읽기 + tbsql 쿼리 실행 →
   evaluate가 TB-01~08 판정. 입력 누락·DB 인증 실패 항목은 review.
3. 리포트: 기존 리포트 화면에 TB-* 항목이 다른 점검과 동일하게 표시.

## 보안

- secret 입력값은 AES-256-GCM 암호화 저장, API 응답·로그·AI 입력에 평문 노출 금지, extra-vars는
  임시파일 채널로만 전달(CLI·프로세스 목록 노출 금지 — 기존 SSH secret과 동일 보증).
- tbsql 비밀번호는 **tbsql argv·제어 노드 로그에 남기지 않는다**: `tbsql -s /nolog`로 시작해 `CONN`을
  stdin으로 전달한다(구현 완료).
- **알려진 잔여 노출(수용, 2026-07-19 사용자 결정):** Ansible이 `{{ tibero_db_pass | quote }}`를 제어
  노드에서 렌더하므로, 대상 서버가 `sh -c '... p='값'; ... | tbsql -s /nolog'`를 실행하는 **스캔 순간**
  그 서버의 셸 argv(`ps`)에 비밀번호가 잠깐 보인다. 온프레미스·기관 통제 대상 서버 전제에서 짧은 창의
  self-ps 노출은 수용하되, 완전 제거(예: ansible copy로 대상에 임시파일 생성 후 `tbsql < file`, 즉시 삭제
  — playbook 렌더러 확장 필요)는 후속 개선으로 둔다.

## 테스트

- 프레임워크: `scanInputs` 인코딩/디코딩(secret 암호화 라운드트립), extra-vars 병합, 필수 누락 시
  review 처리, `getVendorInputSpecs` 순수 로직.
- 티베로 팩: 샘플 evidence(설정파일 텍스트 + tbsql 출력 픽스처)로 `evaluate`가 TB-01~08 판정, detect,
  DB 인증 실패 → review 분기.
- 통합: 등록 폼 동적 필드(타입체크/렌더), 저장→스캔 전달 경로.
- 실 검증은 티베로 인스턴스 필요 — SP1에서는 픽스처 기반 단위/통합까지, 실 DB 검증은 별도.

## 범위 외

- JEUS(SP2)·WebtoB(SP3), 엑셀 업로드의 벤더 입력 컬럼, 티베로 점검 항목의 최종 확정(사용자 검토
  전까지 초안), 실 티베로 인스턴스 대상 E2E.

## 참고(리서치 출처)

- **Tibero 7.2.5 관리자 가이드 "사용자 관리와 데이터베이스 보안"**(기본 계정 목록, `DBA_PROFILES`
  파라미터 FAILED_LOGIN_ATTEMPTS/PASSWORD_LIFE_TIME/PASSWORD_REUSE_*/PASSWORD_VERIFY_FUNCTION/
  SESSIONS_PER_USER, DEFAULT 프로파일 기본값, VERIFY_FUNCTION 규칙, DBA_USERS/ROLE_PRIVS/SYS_PRIVS,
  AUDIT_TRAIL/AUDIT_SYS_OPERATIONS, LSNR_INVITED_IP/DENIED_IP·LISTENER REMOTE):
  https://docs.tibero.com/tibero-manuals/7.2.5.manuals/tibero-administrator-guide/user-management-and-security
- 티베로 보안 가이드/접속(`tbsql sys/tibero`, `$TB_HOME/config/$TB_SID.tip`, 리스너 포트):
  tmaxtibero.blog, docs.tibero.com, ncloud-docs Tibero 퀵가이드.
