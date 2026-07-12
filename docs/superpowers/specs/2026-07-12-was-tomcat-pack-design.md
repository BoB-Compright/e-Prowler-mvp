# WAS — Tomcat 벤더 팩 (#2) 설계

> 작성일: 2026-07-12
> 상태: 승인됨(브레인스토밍) → 구현 계획 대기
> 전제: 벤더 팩 아키텍처(#0)·AI 판정(#2a) 모두 main 병합됨.

## 목표

CIS Apache Tomcat Benchmark 기준으로 Tomcat을 점검하는 `was-tomcat` 팩을 추가한다. 확정된
`VendorPack` 계약에 순수 추가로 붙으며, WAS 카탈로그(CIS-소싱)를 신설한다. review는 최소화하고
(설계상 WAS-12만 본질적 review), 남는 review는 #2a의 AI 판정이 흡수한다.

## 아키텍처

- 신규 카탈로그 데이터 `src/lib/catalog/data/cis/was.json` — WAS-01~12, 각 항목
  `{ id, title, severity, automationStatus:"automated", source:{ framework:"CIS", ref:"Apache Tomcat Benchmark …" } }`.
  **불확실한 CIS 항목번호는 `(항목 확인 필요)`로 정직 표기.**
- `src/lib/catalog/index.ts`의 `CATALOG_SOURCES`에 `{ frameworkId:"cis", category:"was", data: wasData }` 추가.
  `Category`는 `"was"` 포함(#0), CIS 프레임워크 등록됨(#0). 이로써 컴플라이언스 필터가 KISA/CIS 둘 다
  항목을 갖게 되어 실질 동작한다.
- 신규 `src/lib/packs/wasTomcat.ts`에 `wasTomcatPack: VendorPack`(category `WAS`, vendors `["Tomcat"]`,
  executionPath `linux`, itemIds=`getCatalogByCategory("was")`, evidenceTasks, detect, evaluate).
- `src/lib/packs/registry.ts`의 `ALL_PACKS`에 등록. `findVendorPack("WAS","Tomcat")`가 category+vendor로
  매칭(기존 구현 그대로). 미탐지 시 엔진(`evaluatePack`)이 전부 review.
- Tomcat 평가기는 Tomcat 존재를 전제(엔진이 미탐지→review 처리).

## 증거 수집 (Tomcat 고유)

CATALINA_HOME을 먼저 해석하고, 그 경로 기준으로 설정을 읽는다. 모든 태스크는 `raw` + `; true`.

| 태스크명 | 수집 내용 |
|---|---|
| `tomcat detection (internal)` | `CATALINA_HOME` env 또는 표준 경로(`/opt/tomcat`, `/usr/share/tomcat*`, `/opt/*/apache-tomcat*`, `/var/lib/tomcat*`)에서 `conf/server.xml` 존재 → `present:<home>` / `absent` |
| `tomcat server.xml` | CATALINA_HOME/conf/server.xml 내용 |
| `tomcat-users.xml` | CATALINA_HOME/conf/tomcat-users.xml 내용 |
| `tomcat web.xml` | CATALINA_HOME/conf/web.xml 내용 |
| `tomcat webapps listing` | CATALINA_HOME/webapps 하위 디렉터리 목록(기본/샘플 앱 탐지) |
| `tomcat conf perms` | CATALINA_HOME/conf 디렉터리 stat |
| `tomcat process user` | tomcat 프로세스 실행 계정(`ps` 또는 서비스 유닛) |
| `tomcat version` | `version.sh`/RELEASE-NOTES 등에서 버전 |

CATALINA_HOME은 detection 태스크가 확정하며, 후속 태스크는 그 경로를 재해석(nginx/apache 동적 경로 관례).

## 항목별 판정 (WAS-01~12, review 최소화)

| 항목 | 판정 | CIS Tomcat 근거(요지) |
|---|---|---|
| WAS-01 기본/샘플 앱 제거 | pass/fail | webapps에 manager/host-manager/examples/docs/ROOT 샘플 잔존 → 취약 |
| WAS-02 shutdown 포트/명령 하드닝 | pass/fail | server.xml `<Server port="-1">` 또는 SHUTDOWN 명령 비기본 → 양호 |
| WAS-03 비특권 전용 계정 구동 | pass/fail | process user가 root가 아니고 전용 계정 → 양호 |
| WAS-04 conf 디렉터리 권한 | pass/fail | conf 권한이 group/other 쓰기 없음 → 양호 |
| WAS-05 기본 관리자 계정 비활성 | pass/fail | tomcat-users.xml에 활성 `<user>`/`<role>`(특히 manager-gui) 존재 → 취약 |
| WAS-06 AJP 커넥터 비활성/보안 | pass/fail | server.xml AJP Connector 활성 + `secretRequired`/주소 미제한 → 취약(Ghostcat) |
| WAS-07 autoDeploy/deployOnStartup off | pass/fail | Host `autoDeploy="true"`/`deployOnStartup="true"` → 취약 |
| WAS-08 에러/헤더 노출 제한 | pass/fail | Connector `server` 속성·`xpoweredBy`·에러 밸브(StuckThreadDetection 아님) 설정 여부 |
| WAS-09 접근 로깅 | pass/fail | server.xml에 `AccessLogValve` 존재 → 양호 |
| WAS-10 커넥터 TLS/allowTrace off | pass/fail | HTTP Connector `allowTrace="true"` → 취약; TLS Connector(SSLEnabled) 유무 |
| WAS-11 SecurityManager | pass/fail(버전 인지) | 버전 ≥10(deprecated) → 양호(해당 없음); <10이면서 SecurityManager 활성(process `-security` 또는 catalina.policy 커스텀) → 양호, 미활성 → 취약; 판정 애매 시 review(AI 흡수) |
| WAS-12 버전/패치 | review | 버전만으로 최신 패치 단정 불가 — 버전을 evidence로 노출(#2a AI 판정이 흡수) |

정확한 경계값·정규식·경로는 플랜의 각 태스크에서 코드로 확정한다. review 항목(주로 WAS-12,
경우에 따라 WAS-11)은 #2a AI 판정이 증거로 흡수한다.

## 실행 경로 / E2E 검증

- 컨테이너에 Tomcat 설치 후 `WAS/Tomcat` 자산으로 실제 점검.
- positive(Tomcat 설치): U-*(os-unix 베이스라인) + WAS-*가 실제 pass/fail(샘플앱·기본계정·AJP 등 기본설정 판정).
- negative(Tomcat 없음): WAS-* 전부 `review`("선언된 Tomcat 미확인").
- OS 베이스라인 병존. 실제 프로덕션 경로(resolveCheckPlan→합성 플레이북→evaluatePlan)로 검증.
- (선택) `CLAUDE_ANALYSIS_ENABLED=true`로 WAS-12 review가 AI 판정으로 흡수되는지 확인.

## 테스트 전략

- **단위:** 각 Tomcat 평가기 — server.xml/tomcat-users.xml 스니펫·webapps 목록·stat 기반 양호/취약/review
  경계값 fixture. registry(`findVendorPack("WAS","Tomcat")`→was-tomcat). resolve(server+WAS/Tomcat →
  os-unix+was-tomcat, evidenceTasks에 tomcat 탐지 포함). 카탈로그가 was 12항목 + CIS 프레임워크 노출.
- **통합:** 팩이 evidenceTasks/evaluate 노출, evaluatePack 미탐지→review 적용.
- **실제 흐름 verify:** Docker Tomcat 대상 positive/negative/OS 병존, 재실행.

## 다루지 않는 것

- 선택 엔진/오케스트레이터/serverScan/기존 팩(nginx/apache/os-unix/container) 수정(순수 추가 + 카탈로그 소스 1줄).
- WAS의 JBoss/WebLogic/WebSphere(별도 벤더, 후속) — 이번은 Tomcat만.
- AI 판정 메커니즘 변경(#2a에서 완료, 재사용만).
