# JEUS(WAS)·WebtoB(WEB) 벤더 팩 설계 (설정파일 + 관리자 콘솔 로그인)

날짜: 2026-07-19
상태: 사용자 검토 대기 (v2 — 관리자 콘솔 로그인·메인 설정파일 반영)

## 배경 / 목표

벤더 사전 입력값 프레임워크 위에 국산 벤더 **JEUS(WAS)**·**WebtoB(WEB)**를 추가한다. 초기 초안은
`accounts.xml`·`Options`만 봐서 항목이 얕았다(사용자 지적). 상용 인프라 점검 솔루션은 (1) **메인 설정파일
전체**(JEUS `domain.xml`, WebtoB 전체 `http.m`)의 설정값과 (2) **관리자 콘솔 로그인 후 런타임 설정**
(jeusadmin/wsadmin, 데이터소스 DB 계정·커넥션풀 등)까지 본다. 이 스펙은 두 축을 모두 반영한다.

티베로에서 확립한 패턴을 계승: 설정파일 읽기 + 인증 콘솔 조회, 사용자 입력은 Ansible `| quote`,
`sh -c '...'` 래퍼 없음, 비밀번호는 argv 아닌 stdin(프롬프트)으로, fail-closed(입력누락·인증실패·결과없음 →
review). 카탈로그 프레임워크는 기존 `tmax`, 항목 ID 접두 **JE**(JEUS)·**WT**(WebtoB).

## 증거 수집 2계층

- **A. 설정파일 기반(신뢰도 높음):** SSH로 메인 설정파일을 읽어 파싱. 대부분의 하드닝 설정이 여기 있다.
- **B. 관리자 콘솔 기반(인증 필요):** jeusadmin/wsadmin에 관리자 계정·비밀번호로 로그인해 런타임/데이터소스
  상태 조회. **콘솔 출력 형식은 실 인스턴스에서만 확정** → 파싱은 픽스처 테스트, 실환경 검증은 후속.
  콘솔 로그인 필수 입력(계정/비밀번호) 미제공·인증 실패 시 콘솔 의존 항목은 review.

## 보안 (티베로 계승)

- 사용자 입력(경로·도메인·계정·호스트)은 Ansible `| quote`로만 raw 셸에 삽입(명령 주입 방지).
- 콘솔 비밀번호(secret)는 **argv에 두지 않는다**: jeusadmin/wsadmin이 프롬프트로 받도록 stdin으로 전달
  (티베로 tbsql `/nolog`+CONN과 동종). 불가피한 argv 노출이 있으면 스펙에 명시(티베로와 동일한
  "대상 서버 ps 잔여 노출" 수용 조건 적용).

---

## 4. JEUS 팩 (WAS)

### 4-1. 등록
`CATEGORY_VENDORS.WAS`에 `"JEUS"`. 팩 `wasJeus.ts`: category `"WAS"`, vendors `["JEUS"]`, executionPath `"linux"`.

### 4-2. 사전 입력값
| name | label | kind | required | 비고 |
|---|---|---|---|---|
| `jeus_home` | 설치 경로(JEUS_HOME) | path | ✅ | 예: `/home/jeus/jeus7` |
| `jeus_domain` | 도메인명 | text | ✅ | 예: `jeus_domain` |
| `jeus_admin_user` | 관리자 계정 | text | ❌ | jeusadmin 로그인(콘솔 항목용) |
| `jeus_admin_pass` | 관리자 비밀번호 | secret | ❌ | jeusadmin 로그인, 암호화 저장 |
| `jeus_admin_host` | Admin 서버 호스트:포트 | text | ❌ | 예: `localhost:9736` |

경로 조합(quote): 계정파일 `{jeus_home}/domains/{jeus_domain}/config/accounts.xml`,
메인설정 `{jeus_home}/domains/{jeus_domain}/config/domain.xml`,
보안키 `{jeus_home}/domains/{jeus_domain}/config/security/security.key`.

### 4-3. 점검 항목 (JE-01~14)
> 근거: JEUS 보안 관리 가이드(administrator 기본 계정, `{알고리즘}암호문` accounts.xml, AES/DES/SEED,
> security.key), jeusadmin 콘솔(connect -u/-p, 세션·데이터소스 명령), domain.xml 설정.

| ID | 항목 | 심각도 | 증거 | 판정 기준 |
|---|---|---|---|---|
| JE-01 | 기본 관리자 계정(administrator) 사용 | Medium | A(accounts.xml) | name `administrator` 존재 시 fail(변경 권고) |
| JE-02 | 관리자 비밀번호 평문 저장 | High | A(accounts.xml) | password가 `{알고리즘}...` 아니면 fail |
| JE-03 | 약한 비밀번호 암호화 알고리즘 | Low | A(accounts.xml) | `{DES}`/`{DESede}`/`{blowfish}`면 review(AES/SEED 권장) |
| JE-04 | 계정파일(accounts.xml) 권한 | High | A(stat) | 그룹/기타 접근 있으면 fail |
| JE-05 | 보안 키파일(security.key) 권한 | High | A(stat) | 그룹/기타 접근 있으면 fail |
| JE-06 | 세션 타임아웃 설정 | Medium | A(domain.xml) | `session-config`의 `timeout` 미설정/과다(>30분)면 review |
| JE-07 | 세션 쿠키 보안속성 | Medium | A(domain.xml) | 쿠키 `secure`/`http-only` 미설정이면 fail |
| JE-08 | SSL/TLS 리스너 사용 | High | A(domain.xml) | HTTPS/SSL 리스너 없이 평문 리스너만이면 fail |
| JE-09 | 데이터소스 DB 비밀번호 암호화 | High | A(domain.xml) | datasource `password`가 `{알고리즘}...` 아니면(평문) fail |
| JE-10 | 불필요한 샘플/예제 앱 배포 | Medium | B(jeusadmin) 또는 A(domain.xml deployed) | examples/console 샘플 배포면 review |
| JE-11 | 접근/감사 로그 활성화 | Low | A(domain.xml) | access-log/logging 미설정이면 review |
| JE-12 | 관리 콘솔(WebAdmin) 접근 제어 | Medium | A(domain.xml) | 관리 리스너가 전체 개방(0.0.0.0)이면 review |
| JE-13 | 에러페이지/스택트레이스 노출 | Medium | A(domain.xml) | 기본 에러페이지·show-stacktrace 노출이면 fail |
| JE-14 | 관리자 콘솔 로그인 확인(연결성) | Low | B(jeusadmin) | 제공 계정으로 로그인 성공 여부(실패 시 콘솔 항목 review 신호) |

- 증거 태스크: (A) accounts.xml·domain.xml 내용/권한, security.key 권한 — 파일 읽기·stat.
  (B) jeusadmin으로 로그인해 배포앱/런타임 조회(계정 미제공 시 B 항목·JE-14 review).
- 파싱: accounts.xml `password`(`{`시작=암호화), domain.xml의 `session-config`/`listener`(ssl)/`data-source`
  (password)/`error`/deployed 요소를 정규식·요소명으로 추출. 명확한 증거 없으면 review.

---

## 5. WebtoB 팩 (WEB)

### 5-1. 등록
`CATEGORY_VENDORS.WEB`에 `"WebtoB"`. 팩 `webWebtob.ts`: category `"WEB"`, vendors `["WebtoB"]`, executionPath `"linux"`.

### 5-2. 사전 입력값
| name | label | kind | required | 비고 |
|---|---|---|---|---|
| `webtob_dir` | 설치 경로(WEBTOBDIR) | path | ✅ | 예: `/home/webtob` |
| `webtob_admin_port` | wsadmin Admin 포트 | text | ❌ | 예: `9090` |
| `webtob_admin_pass` | wsadmin 비밀번호 | secret | ❌ | 콘솔 로그인(사용 시), 암호화 저장 |

경로(quote): `{webtob_dir}/config/http.m`(텍스트 설정 원본).

### 5-3. 점검 항목 (WT-01~10)
> 근거: WebtoB 환경설정(디렉터리 인덱싱 `Options INDEX`, `http.m` NODE/SVRGROUP/ErrorDocument/Logging/
> Method/SSL 절), wsadmin 콘솔(connect, cfg/st/ci).

| ID | 항목 | 심각도 | 증거 | 판정 기준 |
|---|---|---|---|---|
| WT-01 | 디렉터리 리스팅 비활성 | High | A(http.m) | `Options`에 `INDEX`면 fail |
| WT-02 | 설정파일(http.m) 권한 | Medium | A(stat) | 그룹/기타 쓰기면 fail |
| WT-03 | 불필요한 HTTP 메서드 제한 | High | A(http.m) | PUT/DELETE/TRACE 등 허용(Method 절)이면 fail |
| WT-04 | 에러페이지/서버 정보 노출 | Medium | A(http.m) | 기본 에러페이지·서버 버전 노출(ErrorDocument/ServerTokens 미설정)이면 review |
| WT-05 | SSL/TLS 사용 | High | A(http.m) 또는 B(ci) | SSL 절/443 리스너 없이 평문만이면 fail |
| WT-06 | 접근 로그(Logging) 설정 | Low | A(http.m) | `*LOGGING`/access log 절 없으면 review |
| WT-07 | 요청 크기/타임아웃 제한(DoS 완화) | Medium | A(http.m) | 요청 본문/타임아웃 제한 미설정이면 review |
| WT-08 | 심볼릭 링크/상위경로 접근 제한 | Medium | A(http.m) | 상위 디렉터리 접근 허용 설정이면 fail |
| WT-09 | 관리(wsadmin) 접근 제어 | Medium | A(http.m)/B | Admin 리스너 전체 개방이면 review |
| WT-10 | 관리 콘솔 연결 확인(연결성) | Low | B(wsadmin) | 접속 성공 여부(콘솔 항목 신호) |

- 증거 태스크: (A) http.m 내용/권한. (B) wsadmin `connect`+`cfg`로 런타임 설정 조회(미사용 시 B 항목 review).
- 파싱: http.m의 `Options`(INDEX), `Method`, `ErrorDocument`, `Logging`, `SSL`, 요청제한 절을 정규식으로.

---

## 데이터 흐름
1. 등록: WAS→JEUS/WEB→WebtoB 선택 → 경로 + (선택) 콘솔 계정·비번 입력 렌더 → 저장(비번 secret 암호화).
2. 점검: serverScan이 입력값 extra-vars 전달 → 설정파일 읽기(A) + 콘솔 로그인 조회(B) → evaluate 판정.
3. 리포트: JE-*/WT-* 항목 표시.

## 테스트
- 각 팩: 파싱·판정 픽스처(평문 vs `{AES}`, INDEX 유무, SSL 유무, 메서드 허용, 파일권한, 세션 타임아웃,
  파일 없음→review, 콘솔 입력 누락/로그인 실패→review). 카탈로그 항목·mitigation 정합.
- 콘솔(B) 항목: fixture 기반. 실 JEUS/WebtoB 인스턴스 E2E(콘솔 출력 형식 확인)는 후속(수동).

## 구현 분해 (권장)
규모가 크므로 벤더별·계층별로 분해 가능:
- **SP-A JEUS**: 프레임워크 위 파일기반(JE-01~09,11~13) 먼저 → 콘솔(JE-10,14) 후속.
- **SP-B WebtoB**: 파일기반(WT-01~08) 먼저 → 콘솔(WT-09,10) 후속.
계획 단계에서 이 분해를 확정한다.

## 범위 외 / 알려진 제약
- 콘솔(B) 항목의 실제 명령·출력 형식은 실 인스턴스에서만 확정 → 초안·픽스처 검증, 실 E2E 후속.
- domain.xml/http.m의 모든 하드닝 항목을 망라하지는 않음(초안은 대표 항목). 필요 시 후속 확장.

## 참고(리서치 출처)
- JEUS: docs.tmaxsoft.com JEUS 보안 관리(administrator, `{알고리즘}` accounts.xml, AES/DES/SEED, security.key),
  jeusadmin 콘솔(connect -u/-p/-h, session·data-source 명령), domain.xml 도메인 설정.
- WebtoB: docs.tmaxsoft.com WebtoB 환경설정(`Options INDEX`, `$WEBTOBDIR/config/http.m`), wsadmin 콘솔
  (connect -ip/-port, cfg/st/ci).
