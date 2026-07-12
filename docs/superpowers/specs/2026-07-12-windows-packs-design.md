# Windows 벤더 팩 + WinRM 경로 (#4) 설계

> 작성일: 2026-07-12
> 상태: 승인됨(로드맵 사전 승인) → 구현 계획 대기
> 전제: 벤더 팩(#0)·AI 판정(#2a)·WEB(#1)·WAS(#2)·DB(#3/#3b/#3c) 모두 병합됨.

## 목표

Windows 계열 벤더(IIS·MSSQL·WebLogic·WebSphere)와 Windows Server OS에 대해 **벤더 팩 엔진의
`windows` 실행경로를 완성**한다. 실제 점검은 Windows 호스트/WinRM이 이 환경에 없으므로 **보류**하되,
(1) 각 Windows 자산이 자기 windows 팩으로 해석돼 **"Windows 호스트 연결 대기" review**(미지원 아님)로
나오고, (2) **Windows Server OS 자산이 Linux U-* 대신 os-windows 베이스라인**을 받도록 한다. 점검 기준
(카탈로그)은 CIS로 저작해 `/catalog`·리포트에 노출·필터되게 한다. WinRM 실행 어댑터는 향후를 위한
스캐폴드(스텁)로 둔다.

## 아키텍처

### 실행경로 동작(이미 있는 계약 활용)
- `evaluatePack`(#0)은 이미 `executionPath === "windows"`면 팩 항목 전부를 `review`("Windows 호스트 연결
  대기")로 만든다. 따라서 windows 팩은 **평가기(evaluate)가 실제로 호출되지 않는다** — evaluate/detect/
  evidenceTasks는 최소(스텁)로 두고, `itemIds`·`executionPath:"windows"`·`vendors`·`category`만 의미 있다.

### 베이스라인 라우팅(엔진 변경, resolve.ts)
- 현재 `resolveCheckPlan`: server→os-unix, repo/image→container.
- 변경: **Windows 자산이면 os-windows 베이스라인**을 쓴다.
  - `category==="OS"`: `findVendorPack("OS", vendor)`가 매칭되면(=os-windows, vendors `["Windows Server"]`)
    그 팩만 적용(Linux 베이스라인 대신). 아니면 기존 Linux 베이스라인(os-unix/container).
  - 그 외(WEB/WAS/DB): 벤더 팩을 먼저 찾고, 그 팩의 `executionPath==="windows"`면 베이스라인을
    **os-windows**로(Windows 호스트이므로), 아니면 기존 Linux 베이스라인. 벤더 팩도 함께 push.
- `findVendorPack`은 vendors 비어있지 않은 팩만 매칭하므로 os-unix/container(vendors [])는 절대
  findVendorPack로 안 잡힌다. os-windows는 vendors `["Windows Server"]`라 `findVendorPack("OS","Windows
  Server")`로 잡힌다.

### 카탈로그 (CIS 기준)
- 신규 category **`"windows"`**(Category 유니온에 추가) — WIN-01~10(CIS Windows Server Benchmark).
  신규 `data/cis/windows.json` + CATALOG_SOURCES 등록.
- `db.json`에 **MSSQL-01~10**(CIS SQL Server) 추가.
- `was.json`에 **WLS-01~08**(CIS Oracle WebLogic), **WSP-01~08**(WebSphere IBM 하드닝) 추가.
- **IIS는 WEB-01~26(KISA) 재사용**(웹 기준 벤더 중립 — nginx/apache와 동일). 신규 항목 없음.
- 불확실 CIS 항목번호는 `(항목 확인 필요)`.

### 팩 (모두 executionPath: "windows", review-pending)
| 팩 id | category | vendors | itemIds |
|---|---|---|---|
| os-windows | OS | ["Windows Server"] | WIN-* |
| web-iis | WEB | ["IIS"] | WEB-* (재사용) |
| db-mssql | DB | ["MSSQL"] | MSSQL-* |
| was-weblogic | WAS | ["WebLogic"] | WLS-* |
| was-websphere | WAS | ["WebSphere"] | WSP-* |

각 팩: `evidenceTasks: []`(WinRM 미연결), `detect: () => false`(무의미 — 엔진이 windows 단락),
`evaluate: () => []`(호출 안 됨). `itemIds`는 카탈로그에서 자기 프리픽스 필터(web-iis는 WEB category).
`registry.ts` `ALL_PACKS`에 5개 등록.

### WinRM 스캐폴드
- `src/lib/checks/winrmRunner.ts` — 향후 Windows 실제 점검 진입점 스텁(문서 주석 + `throw`/미구현 표시).
  현재 파이프라인은 windows 팩을 evaluatePack에서 review로 단락하므로 이 스텁은 호출되지 않는다.

## 항목별 판정
- 모든 windows 팩 항목: 엔진이 `review`("Windows 호스트 연결 대기")로 처리. 카탈로그 항목 자체는
  automationStatus "automated"(향후 WinRM으로 자동화 예정)로 두되, 실제 실행 전까지 review.

## E2E / 검증

- **베이스라인 라우팅(핵심, 실 Windows 없이 검증 가능):** OS/Windows Server 자산 → packs=[os-windows]
  (os-unix 아님), WIN-* 전부 review. WEB/IIS 자산 → packs=[os-windows, web-iis], WEB-* review. Linux
  자산(기존)은 os-unix/container 그대로(회귀 없음).
- **미지원 아님 확인:** Windows 벤더는 VENDOR-NA("미지원")가 아니라 review("Windows 호스트 연결 대기").
- **카탈로그/필터:** windows category + MSSQL/WLS/WSP가 CIS로 노출, 컴플라이언스 필터 동작.
- 실제 Windows 점검은 호스트 확보 시(보류).

## 테스트 전략

- 단위: Category "windows" 추가·카탈로그 로드(WIN/MSSQL/WLS/WSP), 각 windows 팩 shape(itemIds 프리픽스,
  executionPath windows, evaluatePack→전부 review), resolveCheckPlan 라우팅(OS/Windows Server→os-windows,
  WEB/IIS→os-windows+web-iis, Linux 회귀 없음), registry(findVendorPack Windows 벤더들).
- 통합: 카탈로그 총계·필터, 기존 Linux 팩 불변.
- 실제 흐름 verify: 라우팅·review-pending·벤더분리(실 Windows 없이). 실제 WinRM 점검은 보류 표시.

## 다루지 않는 것

- 실제 WinRM 연결/점검(스캐폴드만). Windows 팩 evaluate 로직(호스트 확보+WinRM 구현 시 별도 사이클).
- Linux 팩/엔진의 기존 동작 변경(라우팅 추가 외).
