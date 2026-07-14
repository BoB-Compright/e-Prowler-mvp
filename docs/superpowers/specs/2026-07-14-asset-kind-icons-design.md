# 자산 실질 구분 아이콘(리스트 뷰) 설계

> 작성일: 2026-07-14
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
자산의 큰 구분(레포/서버)은 그대로 두되, 인식된 **실질 종류**(OS/WEB/WAS/DB/기타)를 리스트 뷰
(자산 관리·프로젝트 상세·점검 이력)에서 **아이콘+짧은 라벨**로 한눈에 보이게 한다.

## 확정 결정
- **실질 구분 어휘 = 5종**: `os` / `web` / `was` / `db` / `other`. 라벨 `OS` / `WEB` / `WAS` / `DB` / `기타`.
  (tomcat은 WAS, nginx/apache는 WEB로 구분.)
- **판별 소스**: 서버는 선언된 `category`. 레포/이미지는 **이름 추론 우선 + 스캔 보정**(스캔 자동탐지 결과가
  있으면 그걸로 덮어씀).
- **표시 형태 = 아이콘 + 짧은 라벨**(아이콘만은 직관성 낮아 제외).
- **스캔 보정 = persist**: autodetect 스캔 후 감지된 종류를 레포 자산의 `category`에 저장(표시 시점 재도출
  아님). 읽기가 단순하고 보정이 스캔 후 1회로 끝난다.

## 아키텍처

### ① 분류 로직 — `src/lib/assets/kind.ts` (신규 순수 모듈)
```ts
export type AssetKind = "os" | "web" | "was" | "db" | "other";
export const ASSET_KIND_LABEL: Record<AssetKind, string> =
  { os: "OS", web: "WEB", was: "WAS", db: "DB", other: "기타" };
```

- **`classifyAssetKind(asset: Asset): AssetKind`**
  - 서버(`type === "server"`): `asset.category`(OS/WEB/WAS/DB) → kind. category가 없거나 그 외 값이면 `other`.
  - 레포(`type === "repo"`): `asset.category`가 채워져 있으면(=스캔 보정값) 그걸 kind로. 없으면
    `inferAssetKindFromName(...)`. 추론 입력은 `asset.displayName || asset.repoUrl || asset.dockerfilePath || ""`.
- **`categoryToKind(category: string | null): AssetKind`** — `"OS"→os, "WEB"→web, "WAS"→was, "DB"→db`,
  그 외/null → `other`. (대문자 category 문자열을 kind로 정규화하는 공용 헬퍼.)
- **`inferAssetKindFromName(name: string): AssetKind`** — 소문자화 후 키워드 부분일치, 아래 **우선순위대로**
  첫 매칭 반환(구체적 서비스 > 런타임 > OS 베이스):
  1. WAS: `tomcat`, `jboss`, `wildfly`, `weblogic`, `jetty` → `was`
  2. WEB: `nginx`, `apache`, `httpd`, `caddy`, `haproxy` → `web`
  3. DB: `mysql`, `mariadb`, `postgres`, `redis`, `mongo`, `oracle`, `mssql` → `db`
  4. 런타임: `python`, `node`, `golang`, `ruby`, `php`, `openjdk`, `jre`, `jdk`, `dotnet`, `rust` → `other`
  5. OS 베이스: `debian`, `ubuntu`, `alpine`, `centos`, `rocky`, `almalinux`, `rhel`, `fedora`, `trixie`,
     `bookworm`, `bullseye`, `busybox`, `distroless`, `scratch`, `amazonlinux` → `os`
  6. 그 외 → `other`

  검증(사용자 예시): `nhit-image/python-3.12.13-trixie/Dockerfile` → 런타임(python) 우선 → **기타**;
  `nhit-image/tomcat-9.0-jre25/Dockerfile` → **WAS**; `nhit-image/debian-stable-slim/Dockerfile` → **OS**.
  (런타임 규칙4가 OS 규칙5보다 먼저라 python-...-trixie가 OS로 오분류되지 않는다.)

### ② 스캔 보정 (persist)
- autodetect 스캔(레포/이미지)의 rule 평가가 끝난 뒤, 그 run의 `results`(CheckResult[])에서 감지된 실질
  종류를 도출해 **레포 자산의 `category`에 저장**한다. 서버는 선언 category라 건드리지 않는다.
- **도출 `detectKindFromResults(results): "OS"|"WEB"|"WAS"|"DB"|null`**: 각 결과 item id를 카탈로그
  category(`unix`/`container`/`web`/`was`/`db`)로 매핑하고, **non-skip(pass/fail/review) 결과가 하나라도
  있는** 카테고리를 우선순위 **WAS > WEB > DB > OS(unix)** 로 선택. 감지 없으면 `null`(저장 안 함 →
  이름 추론 유지). container(C-*)는 실질 구분에 쓰지 않는다(모든 이미지가 컨테이너라 변별력 없음).
- **저장**: `assetId`가 있고 `type === "repo"`인 run에서만. `updateAssetCategory(assetId, category, db)`
  (신규 store 함수) 호출. best-effort — try/catch로 감싸 실패해도 스캔 흐름에 영향 없음.
- 레포의 `category`는 `resolveCheckPlan`의 autodetect 분기에서 사용되지 않으므로(고정 오토셋), 저장해도
  이후 스캔 계획에 영향 없음.

### ③ 아이콘 컴포넌트 — `src/app/_components/AssetKindBadge.tsx`
- 기존 인라인 SVG 아이콘 스타일 재사용(`stroke="currentColor"`, `viewBox="0 0 24 24"`, `strokeWidth 2`,
  `strokeLinecap/Join round`). kind별 서로 구분되는 5개 SVG(OS=모니터, WEB=지구본, WAS=톱니, DB=원통,
  기타=상자).
- `<AssetKindBadge kind={AssetKind} />` → 아이콘 + 짧은 라벨(`ASSET_KIND_LABEL[kind]`)을 inline-flex로.
  기존 디자인 토큰(`text-[13px] text-muted`, `gap-1.5` 등) 사용. `title`에 동일 라벨(접근성).

### ④ 표시 위치
- **자산 관리**(`src/app/assets/AssetTable.tsx`): 기존 "종류"(레포/서버, `typeLabel`) 셀에 실질 구분
  아이콘+라벨을 병기(큰 구분 텍스트 아래 또는 옆). 행 데이터에 `kind: AssetKind` 추가.
- **프로젝트 상세**(`src/app/projects/[id]/page.tsx`)의 자산 목록: 동일 배지 병기.
- **점검 이력**(`src/app/runs/page.tsx`): "점검 대상" 열의 자산명 옆에 실질 구분 배지. run→asset은 기존
  `assetsById[run.assetId]`로 매핑(자산이 없으면 배지 생략).

## 데이터 흐름
```
서버 자산: 선언 category ──▶ classifyAssetKind ──▶ AssetKind ──▶ <AssetKindBadge>
레포 자산: (스캔 전) 이름 추론 ─┐
          (스캔 후) 저장된 category ─┴▶ classifyAssetKind ──▶ AssetKind ──▶ <AssetKindBadge>
autodetect 스캔 종료: results ──▶ detectKindFromResults ──▶ updateAssetCategory(레포)
```

## 에러/경계
- `asset.category`에 예상 밖 문자열이 들어와도 `categoryToKind`가 `other`로 폴백.
- 이름이 빈 문자열/모호 → `other`.
- 스캔 보정 저장 실패(assetId 없음/DB 오류) → 무시(이름 추론으로 표시).
- 점검 이력에서 run의 asset이 삭제/부재 → 배지 생략(기존 표시 그대로).

## 테스트 전략
- **단위(`inferAssetKindFromName`)**: 사용자 예시 3종 + 각 우선순위 규칙(런타임 vs OS 충돌: `python-...-trixie`
  →other, `openjdk`→other) + 빈/모호 문자열→other.
- **단위(`classifyAssetKind`)**: 서버 category 4종, 레포 category 있음(보정값), 레포 category 없음(이름 추론).
- **단위(`categoryToKind`)**: 4종 + null/이상값→other.
- **단위(`detectKindFromResults`)**: WAS 우선, WEB/DB/OS 단독, 전부 skip→null, container만→null.
- **회귀**: 기존 자산/런 조회, AssetTable 기존 컬럼.
- **UI**: tsc/eslint/next build.

## 다루지 않는 것
- 실질 구분 기반 필터/정렬(표시만).
- 다중 서비스 이미지의 복수 배지(단일 대표 kind만).
- 서버 자산의 이름 추론(서버는 항상 선언 category).
- 과거 스캔 이력의 일괄 재도출(다음 스캔 시 보정; 스캔 전 레포는 이름 추론으로 즉시 표시).
