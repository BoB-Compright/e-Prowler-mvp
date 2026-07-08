# B: 컴플라이언스 프레임워크 일반화 — Design

**Date:** 2026-07-08
**Status:** Approved by user, ready for implementation plan
**Priority:** 7/15 데모 전 필수 완료

## Background

현재 카탈로그(`src/lib/catalog/`)는 KISA 주요정보통신기반시설 가이드를 유일한 기준으로 하드코딩하고 있다. `Category`(`container`|`unix`|`web`)만 있고 "이 항목이 어떤 프레임워크에서 왔는가"라는 축이 없다. `index.ts`는 `container.json`/`unix.json`/`web.json`을 직접 import해서 각각 `withCategory()`로 카테고리만 태깅한다.

로드맵상 B는 "KISA 단일 축 → 여러 프레임워크 지정 가능한 구조"로 정의되어 있다. 이번 스코프에서는 실제 두 번째 프레임워크(CIS Benchmark 등)를 넣지 않는다 — KISA 1개를 유지하면서, 나중에 프레임워크를 추가할 때 **새 JSON 데이터 파일 + 레지스트리 등록만으로 끝나는 구조**를 만드는 것이 목표다.

## Scope

**포함:**
- 카탈로그 데이터 모델에 `Framework` 개념 추가 (`frameworkId` 필드)
- 프레임워크 레지스트리 (`frameworks.ts`) — 현재는 KISA 1개만 등록
- `index.ts`를 하드코딩된 카테고리별 import 대신 선언적 소스 목록(`CATALOG_SOURCES`) 기반으로 재구성
- 데이터 파일을 `data/kisa/...`로 프레임워크별 폴더에 재배치
- `/catalog` 페이지와 `/api/catalog`에 프레임워크 표시 추가
- 테스트: 프레임워크 레지스트리/카운트 정합성 검증

**제외 (다른 서브 프로젝트 또는 이번 스코프 아님):**
- Ansible 룰 ID 네임스페이싱(`U-xx` → `kisa:U-xx`) — 안 건드림
- `runs`/`scan_batches` DB 스키마에 framework 컬럼 추가 — 안 건드림
- Claude 분석 프롬프트에 framework 정보 주입 — 안 건드림
- 한 항목이 여러 프레임워크에 동시 매핑되는 cross-mapping — 프레임워크당 별도 항목으로만 존재
- 프레임워크 선택/필터 UI — 옵션이 1개뿐이라 스킵, 컬럼/배지 표시로 대체
- `Category` 유니온 자체를 동적으로 만들기 — `Category`는 `checks/`, `claude/`, `runs` 파이프라인 전반(9개 파일)에서 쓰이는 타입이라 손대지 않음. 새 프레임워크가 완전히 새로운 카테고리가 필요하면 그때 `Category` 유니온에 한 줄 추가하는 정도는 남겨둔다.

## 데이터 모델

### `Framework` (신규, `types.ts`)

```ts
export interface Framework {
  id: string;          // "kisa"
  name: string;         // "KISA 주요정보통신기반시설 가이드"
  docVersion?: string;  // 참고용, 없으면 생략
}
```

### `CatalogItem` 확장

`frameworkId: string` 필드 추가. `category`, `title`, `severity`, `automationStatus`는 그대로 유지.

### 프레임워크 레지스트리 (신규, `frameworks.ts`)

```ts
export const FRAMEWORKS: Framework[] = [
  { id: "kisa", name: "KISA 주요정보통신기반시설 가이드" },
];
```

### 카탈로그 소스 목록 (`index.ts` 재구성)

기존:
```ts
const CATALOG = [
  ...withCategory(containerData, "container"),
  ...withCategory(unixData, "unix"),
  ...withCategory(webData, "web"),
];
```

변경 후:
```ts
const CATALOG_SOURCES: { frameworkId: string; category: Category; data: RawItem[] }[] = [
  { frameworkId: "kisa", category: "container", data: containerData as RawItem[] },
  { frameworkId: "kisa", category: "unix", data: unixData as RawItem[] },
  { frameworkId: "kisa", category: "web", data: webData as RawItem[] },
];

const CATALOG: CatalogItem[] = CATALOG_SOURCES.flatMap(({ frameworkId, category, data }) =>
  data.map((item) => ({ ...item, category, frameworkId })),
);
```

**새 프레임워크 추가 절차 (구현 완료 기준):** ① JSON 데이터 파일 작성 → ② `FRAMEWORKS`에 항목 추가 → ③ `CATALOG_SOURCES`에 항목 추가. 로더/필터 함수(`getCatalog`, `getCatalogByCategory` 등) 로직은 손대지 않는다.

### 데이터 파일 재배치

`data/container.json` / `data/unix.json` / `data/web.json` → `data/kisa/container.json` / `data/kisa/unix.json` / `data/kisa/web.json`. `index.ts`의 import 경로 3줄만 수정.

### `CatalogSummary` 확장

```ts
export interface CatalogSummary {
  total: number;
  byCategory: Record<Category, number>;
  byFramework: Record<string, number>; // 신규
  automated: number;
  notAutomated: number;
}
```

### 신규 헬퍼

```ts
export function getFrameworks(): Framework[] {
  return FRAMEWORKS;
}
```

## UI / API

| 위치 | 변경 |
|---|---|
| `/api/catalog` | 응답에 `frameworks: FRAMEWORKS` 추가. `items`에는 이미 `frameworkId`가 포함됨(타입 확장 결과) |
| `/catalog` 페이지 | 테이블에 "프레임워크" 컬럼(또는 배지) 추가. 상단 요약 문구에 프레임워크별 개수 표시 (`byFramework`) |

필터 UI(드롭다운)는 만들지 않는다 — 옵션이 1개뿐인 필터는 실질적 가치가 없고 데모에서 죽은 UI로 보인다. 컬럼/배지 표시만으로 구조가 일반화됐음을 충분히 보여준다.

## 엣지 케이스 & 에러 처리

| 상황 | 처리 |
|---|---|
| `CatalogItem.frameworkId`가 `FRAMEWORKS`에 등록되지 않은 값 | 테스트에서 검증(아래 테스트 전략) — 런타임 방어 로직은 추가하지 않음, MVP 단일 팀 개발 환경 전제 |
| 향후 새 프레임워크가 기존 3개 카테고리 외의 카테고리가 필요한 경우 | `Category` 유니온에 값 추가 필요 (완전한 무코드변경은 이번 스코프의 목표가 아님, 위 Scope 참고) |

## 테스트 전략

**단위 테스트 (`index.test.ts` 확장)**
- `getFrameworks()`가 KISA 1개를 반환하는지
- `getCatalogSummary().byFramework`가 올바른 카운트를 주는지 (KISA 전체 = `total`)
- 모든 `CatalogItem.frameworkId`가 `FRAMEWORKS`에 등록된 `id` 중 하나와 일치하는지
- 기존 `getCatalogByCategory`, `getCatalog`, `getCatalogItem` 동작이 그대로 유지되는지 (회귀 확인)

## 로드맵 컨텍스트 (참고용, 이번 스코프 아님)

- **A1**: 자산 관리 + 프로젝트 그룹핑
- **A2**: SSH 점검 실행 엔진
- **C**: 점검 스케줄링 (사용자 요청 vs 주기적)
- **D**: CVE 실시간 감시 파이프라인
