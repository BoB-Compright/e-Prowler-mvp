# JEUS(WAS)·WebtoB(WEB) 벤더 팩 (파일기반) 설계

날짜: 2026-07-19
상태: 사용자 검토 대기

## 배경 / 목표

벤더 사전 입력값 프레임워크(2026-07-19 도입) 위에 국산 벤더 두 개를 추가한다: **JEUS(WAS)**, **WebtoB(WEB)**.
둘 다 티베로 TB-13/14와 동일한 **설정파일 기반** 점검이라, SSH로 대상 서버의 설정파일을 읽어 판정한다.
**DB 로그인·비밀번호 입력이 필요 없다**(경로 입력만) → 티베로 DB 점검의 ps 노출 우려가 없다. 티베로에서
확립한 안전 패턴(사용자 입력은 Ansible `| quote`, `sh -c '...'` 래퍼 없음, fail-closed)을 그대로 따른다.

## 결정 (기존 방침 계승)

- 카탈로그 프레임워크는 기존 `tmax`(국산 벤더 하드닝). 항목 ID 접두: **JE**(JEUS/WAS)·**WT**(WebtoB/WEB).
- 점검 항목·입력값은 Tmax 공식 문서 리서치 초안(§4/§5) — 사용자 검토 후 확정, 실 인스턴스 검증은 후속.
- 두 팩은 각각 `src/lib/packs/wasJeus.ts`·`src/lib/packs/webWebtob.ts`, `ALL_PACKS` 등록.

## 프레임워크 재사용 (신규 메커니즘 없음)

각 팩이 `requiredInputs`(경로/텍스트만, secret 없음)를 선언 → 등록 폼 동적 수집 → scan_inputs 저장(secret
없으므로 전부 평문) → 스캔이 extra-vars로 전달 → evidence raw가 `{{ 변수 }}`(quote 필터)로 참조. 카탈로그
`tmax` 프레임워크에 JE/WT 항목 + mitigation. 프레임워크 코드 변경 없음(콘텐츠만 추가).

---

## 4. JEUS 팩 (WAS)

### 4-1. 등록
- `CATEGORY_VENDORS.WAS`에 `"JEUS"` 추가. 팩 `wasJeus.ts`: category `"WAS"`, vendors `["JEUS"]`,
  executionPath `"linux"`.

### 4-2. 사전 입력값 (secret 없음)
| name | label | kind | required | 비고 |
|---|---|---|---|---|
| `jeus_home` | 설치 경로(JEUS_HOME) | path | ✅ | 예: `/home/jeus/jeus7` |
| `jeus_domain` | 도메인명 | text | ✅ | 예: `jeus_domain` |

설정 경로 조합(quote): 계정파일 `{jeus_home}/domains/{jeus_domain}/config/accounts.xml`,
보안키 `{jeus_home}/domains/{jeus_domain}/config/security/security.key`.

### 4-3. 점검 항목 (JE-01~05, 파일기반)
> 근거: JEUS 보안 관리 가이드 — 기본 관리자 계정 `administrator`, 비밀번호는 `{알고리즘}암호문` 형식으로
> `accounts.xml`에 저장(평문 금지), 지원 알고리즘 AES/DES/DESede/blowfish/SEED.

| ID | 항목 | 심각도 | 증거·판정 기준 |
|---|---|---|---|
| JE-01 | 기본 관리자 계정(administrator) 사용 | Medium | `accounts.xml`에 name `administrator` 계정 존재 시 fail(계정명 변경 권고) |
| JE-02 | 관리자 비밀번호 평문 저장 | High | `accounts.xml`의 password가 `{알고리즘}...` 형식 아니면(평문) fail |
| JE-03 | 약한 비밀번호 암호화 알고리즘 | Low | password 알고리즘이 `{DES}`/`{DESede}`/`{blowfish}`이면 review(AES/SEED 권장) |
| JE-04 | 계정파일(accounts.xml) 권한 | High | SSH `stat`: 그룹/기타 읽기·쓰기 권한 있으면 fail(비밀번호 포함 파일) |
| JE-05 | 보안 키파일(security.key) 권한 | High | SSH `stat`: 그룹/기타 접근 권한 있으면 fail |

- 증거 태스크(파일기반, quote): accounts.xml 내용, accounts.xml 권한, security.key 권한.
- `detect`: 서버 declared 모드라 항상 true. `evaluate`: 필수 입력 미제공/파일 없음 → review(fail-closed).
- 파싱: `accounts.xml`의 `<password>{...}...</password>` 또는 `password="..."` 값 추출(정규식). `{`로 시작하면
  암호화, 아니면 평문. `{DES}`류면 약한 알고리즘.

---

## 5. WebtoB 팩 (WEB)

### 5-1. 등록
- `CATEGORY_VENDORS.WEB`에 `"WebtoB"` 추가. 팩 `webWebtob.ts`: category `"WEB"`, vendors `["WebtoB"]`,
  executionPath `"linux"`.

### 5-2. 사전 입력값 (secret 없음)
| name | label | kind | required | 비고 |
|---|---|---|---|---|
| `webtob_dir` | 설치 경로(WEBTOBDIR) | path | ✅ | 예: `/home/webtob` |

설정 경로(quote): `{webtob_dir}/config/http.m`(텍스트 설정 원본).

### 5-3. 점검 항목 (WT-01~03, 파일기반)
> 근거: WebtoB 환경설정 가이드 — 디렉터리 인덱싱은 `Options`에 `INDEX` 추가로 활성, 설정파일
> `$WEBTOBDIR/config/http.m`.

| ID | 항목 | 심각도 | 증거·판정 기준 |
|---|---|---|---|
| WT-01 | 디렉터리 리스팅 비활성 | High | `http.m`의 `Options`에 `INDEX`가 있으면 fail(디렉터리 리스팅 노출) |
| WT-02 | 설정파일(http.m) 권한 | Medium | SSH `stat`: 그룹/기타 쓰기 권한 있으면 fail |
| WT-03 | 접근 로그 설정 | Low | `http.m`에 `*LOGGING`/`Logging` 절 설정 없으면 review(로깅 미설정 가능) |

- 증거 태스크(파일기반, quote): http.m 내용, http.m 권한.
- `detect`: 항상 true. `evaluate`: 필수 입력 미제공/파일 없음 → review. INDEX 판정은 대소문자 무시,
  `Options` 라인의 값에 `INDEX` 토큰이 있는지로.

---

## 데이터 흐름
1. 등록: WAS→JEUS 또는 WEB→WebtoB 선택 → 경로 입력 필드 렌더 → 저장(secret 없음, 평문 경로).
2. 점검: serverScan이 입력값을 extra-vars로 전달 → evidence raw가 설정파일 읽기 → evaluate가 JE/WT 판정.
3. 리포트: 기존 화면에 JE-*/WT-* 항목 표시.

## 보안
- 사용자 입력(경로/도메인)은 Ansible `| quote`로만 raw 셸에 삽입(명령 주입 방지, 티베로 패턴). secret
  입력이 없어 암호화·ps 노출 이슈 없음.

## 테스트
- 각 팩: 파싱·판정 픽스처 테스트(평문 vs `{AES}`, INDEX 유무, 파일 권한 과다, 파일 없음→review, 입력
  누락→review). `getVendorInputSpecs`가 벤더별 입력 스펙 반환. 카탈로그 항목·mitigation 정합.
- 실 JEUS/WebtoB 인스턴스 대상 E2E는 후속(파일 형식 실환경 확인).

## 범위 외
- JEUS domain.xml의 세션·SSL·에러페이지 등 XML 심층 항목(초안은 계정·파일권한 중심), WebtoB HTTP 메서드
  제한·에러페이지 등 추가 항목, 실 인스턴스 E2E. 필요 시 후속 확장.

## 참고(리서치 출처)
- JEUS: docs.tmaxsoft.com JEUS 보안 관리(기본 계정 administrator, `{알고리즘}` 암호문 accounts.xml,
  AES/DES/SEED, security.key), 설정 경로 `$JEUS_HOME/domains/<domain>/config/`.
- WebtoB: docs.tmaxsoft.com WebtoB 환경설정(디렉터리 인덱싱 `Options INDEX`/DIRINDEX, `$WEBTOBDIR/config/http.m`).
