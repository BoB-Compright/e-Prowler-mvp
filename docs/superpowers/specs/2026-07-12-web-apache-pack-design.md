# WEB — Apache 벤더 팩 (#1) 설계

> 작성일: 2026-07-12
> 상태: 승인됨(브레인스토밍) → 구현 계획 대기
> 전제: 벤더 팩 아키텍처(#0, `docs/superpowers/specs/2026-07-12-vendor-scoped-checks-design.md`)는 이미 main에 병합됨.

## 목표

KISA 웹 서비스 기준(WEB-01~26)을 **Apache**로 평가하는 `web-apache` 팩을 추가한다.
확정된 `VendorPack` 계약에 플러그인으로 붙으며, 기존 코드(선택 엔진/오케스트레이터/nginx 팩)는
수정하지 않는다. 자동판정 범위는 nginx 팩과 동일 철학(설정·모듈로 명확한 항목은 pass/fail,
계정·비밀번호·버전 등은 review).

## 아키텍처

- 신규 파일 `src/lib/packs/webApache.ts`에 `webApachePack: VendorPack` 정의.
- `src/lib/packs/registry.ts`의 `ALL_PACKS`에 `webApachePack` 추가. `findVendorPack("WEB","Apache")`가
  이 팩을 반환(vendor 대소문자 무시는 기존 구현 그대로).
- 필드: `id:"web-apache"`, `category:"WEB"`, `vendors:["Apache"]`, `executionPath:"linux"`,
  `itemIds = getCatalogByCategory("web").map(i=>i.id)`(WEB-01~26 재사용, **새 카탈로그 항목 없음**),
  `evidenceTasks`(아래 Apache 고유 태스크), `detect`(Apache 존재), `evaluate`(Apache 평가기 조합).
- **미탐지 처리는 엔진이 담당**: `evaluatePack`이 `vendors.length>0 && !detect()`일 때 팩 항목 전부를
  `review`("선언된 Apache 미확인")로 만든다. 따라서 Apache 평가기는 **Apache 존재를 전제**로 작성하고
  개별 not-present 가드를 두지 않는다(nginx 평가기의 `skipNoNginx`류 방어 코드 불필요).
- WEB 카탈로그 항목은 nginx/apache가 공유한다(같은 KISA 기준). 어느 팩이 평가할지는 선택 엔진이
  자산의 vendor로 결정하므로 `appliesTo` 태깅에 의존하지 않는다.

## 증거 수집(Apache 고유 태스크)

nginx는 `nginx -T`로 완전 해석된 설정을 한 번에 얻지만 Apache엔 등가물이 없어, 아래를 조합한다.
모든 태스크는 `ansible.builtin.raw`(대상에 Python 불필요)이며 `; true`로 grep/파일부재의 비정상 종료를
흡수한다. 태스크 `name`은 팩 내 유일하고, 평가기는 `findTaskOutput`이 아니라 **정확한 태스크명**으로
증거를 찾는다(nginx 내부 헬퍼 태스크와 동일 관례).

| 태스크명 | 수집 내용 |
|---|---|
| `apache detection (internal)` | `apache2`/`httpd` 바이너리 존재 + 설정 디렉터리(`/etc/apache2` 또는 `/etc/httpd`) 존재 → `present`/`absent` |
| `apache modules (internal)` | `apache2ctl -M 2>/dev/null` 또는 `httpd -M 2>/dev/null`(로드된 모듈 목록) |
| `apache effective config (internal)` | 존재하는 설정 파일만 concat: Debian(`/etc/apache2/apache2.conf`, `ports.conf`, `conf-enabled/*.conf`, `mods-enabled/*.conf`, `sites-enabled/*.conf`) + RHEL(`/etc/httpd/conf/httpd.conf`, `/etc/httpd/conf.d/*.conf`) |
| `apache version (internal)` | `apache2ctl -v 2>&1` 또는 `httpd -v 2>&1` |
| `apache docroot scan (internal)` | 설정에서 `DocumentRoot` 추출 → 각 경로에서 잔여파일(`LEFTOVER:`)·월드라이터블(`WRITABLE:`) 스캔(nginx docroot 스캔과 동일 출력 관례) |
| `WEB-03: apache auth password file permissions` | 설정에서 `AuthUserFile` 경로 추출 → `stat -c "%U:%G %a"` |
| `WEB-26: apache log directory permissions` | 설정에서 `CustomLog`/`ErrorLog`/`APACHE_LOG_DIR` 기준 로그 디렉터리 → `stat` (기본 `/var/log/apache2` 또는 `/var/log/httpd`) |

탐지·모듈·설정·버전 태스크는 `absent`/`__MISSING__` 마커로 부재를 표현한다.

## 항목별 판정(WEB-01~26)

분류 원칙: **설정 지시어·로드 모듈로 명확히 판정되는 항목은 pass/fail**, **설정만으로 단정 불가한
항목(계정명·비밀번호 강도·버전 최신성·외부 시스템 연동)은 review**. 각 항목 `source`는 기존 WEB
카탈로그 그대로 `KISA · 웹 서비스 WEB-XX`.

| 항목 | 판정 | Apache 근거(요지) |
|---|---|---|
| WEB-01 Default 관리자 계정명 | review | Apache는 자체 관리자 계정 없음(HTTP 기본인증만). 자동 단정 불가 |
| WEB-02 취약한 비밀번호 | review | 해시된 AuthUserFile 내부는 설정검사로 확인 불가 |
| WEB-03 비밀번호 파일 권한 | pass/fail | `AuthUserFile` 권한 ≤ 소유자 전용이면 양호 |
| WEB-04 디렉터리 리스팅 | pass/fail | `Options`에 `Indexes` 활성(및 mod_autoindex) → 취약 |
| WEB-05 미지정 CGI/ISAPI | review | ScriptAlias/mod_cgi 조합의 의도 판단 필요 |
| WEB-06 상위 디렉터리 접근 | pass/fail | `AllowOverride`·`<Directory />`의 `Require`/`Options` 제한 여부 |
| WEB-07 불필요 파일 제거 | pass/fail | docroot 스캔의 `LEFTOVER:` 존재 여부 |
| WEB-08 업로드/다운로드 용량 | review | `LimitRequestBody` 정책값의 적정성은 조직기준 필요 |
| WEB-09 프로세스 권한 | pass/fail | `User`/`Group`이 root가 아니면 양호 |
| WEB-10 불필요 프록시 | pass/fail | mod_proxy 계열 로드 시 취약(불필요 가정), 미로드 양호 |
| WEB-11 경로 설정 | review | DocumentRoot 적정성은 맥락 필요 |
| WEB-12 링크 사용 금지 | pass/fail | `Options`에 `FollowSymLinks`/`SymLinksIfOwnerMatch` 여부 |
| WEB-13 설정 파일 노출 | pass/fail | `.htaccess`/conf에 대한 `<Files>`/`Require all denied` 여부 |
| WEB-14 경로 내 접근통제 | pass/fail | `<Directory>` 기본 `Require all denied` 여부 |
| WEB-15 스크립트 매핑 제거 | review | 필요한 핸들러 판단 필요 |
| WEB-16 헤더 정보 노출 | pass/fail | `ServerTokens Prod` + `ServerSignature Off` |
| WEB-17 가상 디렉토리 삭제 | review | 불필요 Alias 판단 필요 |
| WEB-18 WebDAV 비활성화 | pass/fail | mod_dav/mod_dav_fs 미로드 → 양호 |
| WEB-19 SSI 제한 | pass/fail | mod_include 미로드 또는 `Options -Includes` |
| WEB-20 SSL/TLS 활성화 | pass/fail | mod_ssl 로드 + `SSLEngine on` |
| WEB-21 HTTP 리디렉션 | pass/fail | HTTP→HTTPS 리디렉션(`Redirect`/`RewriteRule`/mod_ssl) 여부 |
| WEB-22 에러 페이지 | review | 커스텀 에러 페이지 정책 판단 필요 |
| WEB-23 LDAP 알고리즘 | review | 외부 LDAP 연동 구성 필요 |
| WEB-24 업로드 경로/권한 | review | 조직 업로드 경로 정책 필요 |
| WEB-25 보안 패치/버전 | review | 버전만으로 패치 적용 여부 단정 불가(버전은 증거로 노출) |
| WEB-26 로그 디렉터리 권한 | pass/fail | 로그 디렉터리 권한 stat |

정확한 경계값(권한 모드, 정규식, 마커)은 플랜의 각 태스크에서 코드로 확정한다.

## 실행 경로 / E2E 검증

- 기존 nhg-test 컨테이너(Ubuntu 24.04)에 `apache2` 설치 후 `WEB/Apache` 자산으로 실제 점검.
- 검증 항목:
  - **positive**(Apache 설치): U-*(os-unix 베이스라인) + WEB-*가 정상 pass/fail/review로 평가.
  - **negative**(Apache 미설치): WEB-* 전부 `review`("선언된 Apache 미확인").
  - **OS 베이스라인 병존**: 애플리케이션 자산이라도 U-* 함께 나옴.
- 실제 프로덕션 경로(resolveCheckPlan → 합성 플레이북 실 ansible → evaluatePlan)로 검증.

## 테스트 전략

- **단위:** 각 Apache 평가기 — 양호/취약/review 경계값 fixture(모듈 목록·설정 스니펫 기반).
  registry — `findVendorPack("WEB","Apache")`가 `web-apache` 반환. resolve — `server+WEB/Apache` →
  `os-unix + web-apache`, evidenceTasks에 apache 탐지 태스크 포함. 증거 태스크 병합 충돌 없음.
- **통합:** 팩이 evidenceTasks/evaluate를 올바르게 노출. evaluatePack 미탐지→review가 apache 팩에도 적용.
- **실제 흐름 verify:** Docker apache2 대상 실제 점검(positive/negative/OS 병존), 재실행 포함.

## 다루지 않는 것

- WEB catalog 항목 신설/변경(기존 KISA 항목 재사용).
- 선택 엔진/오케스트레이터/serverScan/nginx 팩 수정(순수 추가).
- IIS(#4, Windows) — 별도 사이클.
- repo 등록폼 category/vendor 필드(#0 백로그 항목).
