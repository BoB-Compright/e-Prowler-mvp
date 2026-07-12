# 벤더 기반 점검 선택 엔진 + WEB 벤더 팩 설계

> 작성일: 2026-07-12
> 상태: 승인됨(브레인스토밍) → 구현 계획 대기

## 목표

자산 등록 시 수집한 `category`(OS/WEB/WAS/DB)와 `vendor`(Nginx/Apache/Tomcat/Oracle 등)를
근거로 **그 자산에 맞는 점검 기준만** 선택·실행한다. 벤더를 늘려도 기존 코드를 고치지 않고
"팩 추가"만으로 확장되는 구조를 만들고, 실제 두 번째 벤더(Apache)로 검증까지 끝낸다.

## 로드맵(전체 완주 대상)

| # | 하위 프로젝트 | 실행 경로 | 근거 원문 | 상태 |
|---|---|---|---|---|
| **0** | 벤더 기반 점검 선택 엔진(팩 구조 + 선택 엔진 + 카탈로그/리포트 필터) | 기존 | 구조 | **이번 스펙** |
| **1** | WEB — nginx 팩 이관 + Apache 신규 | Linux/SSH | KISA(있음) | **이번 스펙** |
| 2 | WAS — Tomcat → JBoss/WildFly | Linux/SSH | CIS | 후속 |
| 3 | DB — MySQL/PostgreSQL/MariaDB → Oracle-XE | Linux/SSH | CIS | 후속 |
| 4 | Windows — WinRM 경로 + IIS/MSSQL/WebLogic/WebSphere | WinRM(신설) | CIS | 후속(실제 점검 보류) |

**이번 스펙의 범위 = #0 + #1.** #2~4는 각각 별도 brainstorm→plan→구현 사이클로 이어가되,
모두 #0에서 확립한 "벤더 팩 계약"에 플러그인으로 붙는다.

## 아키텍처

### 벤더 팩(Vendor Pack)

현재는 단일 거대 플레이북(`ansible/security-checks.yml`)이 모든 증거를 수집하고
`evaluateAllChecks`가 모든 평가기를 무조건 실행한다. nginx는 `appliesTo:["nginx"]`로
하드코딩돼 있다. 이 구조를 **팩 단위**로 재구성한다. 팩 하나가 자기 완결적으로 선언한다:

```ts
interface VendorPack {
  id: string;                       // "web-nginx", "web-apache", "os-unix", "container"
  category: AssetCategory | "container"; // OS/WEB/WAS/DB + 이미지 전용 "container"
  vendors: string[];                // 이 팩이 담당하는 vendor 값들 (베이스라인 팩은 [])
  executionPath: "linux" | "windows";
  detect(tasks: AnsibleTaskOutput[]): boolean; // 호스트에 이 SW가 실제로 있는가
  evidenceTasks: PlaybookTask[];    // 이 팩이 필요로 하는 수집 태스크만
  evaluate(ctx: EvalContext): CheckResult[]; // 이 팩의 항목 평가기
}
```

- 카탈로그 항목(`CatalogItem`)은 자기 출처를 데이터로 보유한다(아래 "출처·인용" 참조).
- 팩은 `src/lib/packs/`에 벤더별 파일로 두고 `src/lib/packs/registry.ts`에 등록한다.
  #1~4 확장은 "새 파일 추가 + registry 등록"이며 선택 엔진/오케스트레이터 코드는 불변이다.

### 선택 엔진 `resolveCheckPlan(asset)`

```ts
interface CheckPlan {
  packs: VendorPack[];              // 이 자산에 적용할 팩들
  evidenceTasks: PlaybookTask[];    // 팩들의 evidenceTasks 합집합(중복 태스크명 병합)
}
export function resolveCheckPlan(asset: Asset): CheckPlan;
```

동작:
1. 자산의 `category`+`vendor`로 적용 팩을 고른다(아래 결정 규칙).
2. 팩들의 `evidenceTasks`를 **태스크명 기준으로 dedupe·병합**해 플레이북을 구성한다.
   (예: `os-unix`와 `web-nginx`가 같은 헬퍼를 요구해도 한 번만 수집.)
3. 오케스트레이터는 선택된 팩의 `evaluate`만 호출한다 — "무조건 전부"가 "선택된 팩만"으로 바뀐다.

### 점검셋 결정 규칙

| 자산 category | vendor | 적용 팩 |
|---|---|---|
| OS | Ubuntu/RHEL/CentOS | `os-unix` + (repo/이미지 자산이면) `container` |
| OS | Windows Server | `os-windows`(보류, executionPath=windows) |
| WEB | Nginx / Apache / IIS | `web-<vendor>` **+ 서버 자산이면 `os-unix`** |
| WAS | Tomcat / JBoss / WebLogic / WebSphere | `was-<vendor>` **+ `os-unix`** |
| DB | Oracle / MySQL / PostgreSQL / MariaDB / MSSQL | `db-<vendor>` **+ `os-unix`** |

규칙 1 — **베이스라인은 `sourceType`으로, 벤더 팩은 `category`+`vendor`로:**
베이스라인 팩은 자산의 실행 형태로 정한다 — `sourceType==="server"` → `os-unix`,
`sourceType==="repo"|"local_image"` → `container`. 그 위에 `category`+`vendor`로 고른
벤더 전용 팩(`web-*`/`was-*`/`db-*`)을 **항상 더한다**. 즉 "WAS/Tomcat 서버"는
`os-unix` + `was-tomcat`, "nginx가 든 repo"는 `container` + `web-nginx`가 된다.
OS category 자산은 벤더 전용 팩 없이 베이스라인만 적용한다.

규칙 2 — **선언 벤더가 기준(미탐지 → 검토):** 선택된 벤더 팩은 항상 실행 대상이다.
팩의 `detect()`가 false(해당 SW가 호스트에 없음)면, 그 팩의 항목들은 `skip`이 아니라
**`review`** 로 판정하고 근거에 `"선언된 <vendor> 미확인 — 인벤토리 확인 필요"`를 남긴다.
Windows 팩은 실행 경로 미연결이므로 항상 `review`("Windows 호스트 연결 대기")로 나온다.

## 출처·인용 모델

각 항목이 `source: { framework, ref }`만 보유하며 **부정 문구("KISA 아님") 없이 대등하게** 표기한다.

```ts
interface CatalogItem {
  id: string;
  category: Category;               // container | unix | web | was | db
  frameworkId: string;              // "kisa" | "cis"
  source: { framework: string; ref: string };
  title: string;
  severity: Severity;
  automationStatus: AutomationStatus;
  appliesTo?: string[];             // 담당 vendor(팩) — 기존 Technology에서 일반 문자열로 확장
}
```

- 기존 U-*/WEB-*/C-*: `frameworkId:"kisa"`, `ref` 예) `"웹 서비스 WEB-04"`. (리포에 원문 있음.)
- 신규 WAS/DB/Windows: `frameworkId:"cis"`, `ref` 예) `"Apache Tomcat 9 Benchmark v1.2 §7.1"`.
- **없는 출처는 지어내지 않는다.** CIS 항목번호가 불확실하면 `ref`에 `"CIS <제품> Benchmark (항목 확인 필요)"`로
  표기해 검토 대상임을 드러낸다.
- `frameworks.ts`에 CIS를 정식 등록: `{ id:"cis", name:"CIS Benchmark" }`.

## 카탈로그 & 리포트의 컴플라이언스 필터

### 카탈로그(`/catalog`)

- 업데이트된 컴플라이언스가 **기존 카드 양식 그대로** 노출되고, 각 카드에 출처 배지(`KISA`/`CIS`)를 표시한다.
- 현재 `?framework=` 파라미터가 실제로는 category에 매핑돼 있어 명칭이 혼동된다. 이를 정리한다:
  - category 필터 파라미터를 `?category=`로 명명(값: container/unix/web/was/db).
  - **컴플라이언스(프레임워크) 필터를 별도 축으로 추가**: `?compliance=kisa|cis`, category 필터와 AND 결합.
- `Category`에 `"was"`, `"db"`를 추가한다. `CATEGORY_LABELS`/`getCatalogSummary`/`FilterPanel`을 함께 갱신.

### 점검 이력 / 보안 점검 보고서(`ReportView.tsx`)

- 점검항목 필터에 **컴플라이언스별 필터**를 추가한다(예: KISA 항목만 / CIS 항목만 보기).
- 각 항목 행에 출처 배지를 표시한다.
- 이를 위해 `CheckResult`에 `frameworkId`(및 표시용 `source`)를 실어 보낸다 — 오케스트레이터가
  평가 결과를 저장할 때 카탈로그에서 조회해 채운다. 저장 스키마(`checks` 테이블)에 `framework_id`
  컬럼을 ADD COLUMN 마이그레이션으로 추가(nullable, 기존 행은 카탈로그 조회로 표시 시 보정).

## 실행 경로

- **Linux 벤더(이번 사이클 실제 점검 대상은 Apache/nginx):** 공식 Docker 이미지로 테스트 서버를 띄워
  SSH/쉘 경로로 실제 E2E 점검·검증한다. (#2~4의 Tomcat/Oracle/MySQL/PostgreSQL/MariaDB도 동일 방식.)
- **Windows 벤더(#4, 경로만·보류):** `executionPath:"windows"` 팩은 카탈로그+평가 로직+WinRM 실행
  어댑터 스텁까지 구현하되, 실제 호스트가 없으면 판정은 `review`. 호스트/자격증명이 생기면 실제 점검.

## 데이터 흐름

```
등록: 사용자 → category/vendor 수집 → asset 저장(기존 컬럼)
점검: orchestrator
        → resolveCheckPlan(asset)              # 팩 선택 + evidenceTasks 합성
        → 플레이북 실행(선택된 evidenceTasks만)
        → 각 팩.evaluate() 실행 → CheckResult[]  # frameworkId/source 부착
        → checks 저장(framework_id 포함)
표시: /catalog     → category + compliance 필터, 출처 배지
     ReportView   → 점검항목 컴플라이언스 필터, 출처 배지
```

## 에러 / 경계 처리

- **선언 벤더 미탐지:** 해당 팩 항목 전부 `review`(위 규칙 2). run 자체는 실패가 아니다.
- **Windows 팩:** 실행 경로 미연결 → `review`. 파이프라인 오류로 취급하지 않는다.
- **팩 미매칭(알 수 없는 vendor):** 해당 category의 베이스라인만 적용하고, 벤더 팩 부재를
  `review`("미지원 벤더 — 자동 점검 미구현")로 1건 남겨 침묵하지 않는다.
- **evidenceTasks 병합 충돌:** 같은 태스크명·다른 커맨드가 등록되면 registry 로드시 예외로 조기 실패
  (개발 시점에 드러나게).

## 테스트 전략

- **단위:**
  - `resolveCheckPlan` — category/vendor 조합별 팩 선택, 베이스라인 합성(WEB/WAS/DB+os-unix),
    미탐지→review, 미지원 벤더→review, 이미지 자산→container 경로.
  - evidenceTasks 병합 — 중복 dedupe, 충돌 시 예외.
  - 각 신규 평가기(Apache WEB-01..26) — 양호/취약/검토 경계값 fixture.
  - 필터 — `filterCatalog`에 compliance 축 추가, category=was/db 파싱.
- **통합:** registry가 플레이북과 평가기 목록을 올바르게 조립하는지; ReportView 필터가
  frameworkId로 항목을 걸러내는지.
- **실제 흐름 verify:** Docker 테스트 서버(nginx, apache) 실제 점검까지 — 단위 통과 후 실제 E2E,
  재실행/중복/전부-skip 경로 포함.

## 이번 스펙에서 다루지 않는 것(후속 사이클)

- WAS/DB/Windows 벤더 팩의 실제 점검 항목 저작(#2/#3/#4).
- WinRM 실행 어댑터의 실제 연결(#4, 스텁만).
- OS vendor(Ubuntu vs RHEL) 세분화 — 현 KISA Unix 기준이 배포판 중립이라 `os-unix` 단일 유지.
