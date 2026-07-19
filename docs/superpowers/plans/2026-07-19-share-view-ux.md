# PM 공유 뷰 UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PM 공유 뷰에서 관리자 내비를 숨기고, 공유 외 경로는 친절한 안내 페이지로 처리하며, 자산을 종류별로 묶어 선택하게 한다.

**Architecture:** proxy가 공유 뷰 요청에 `x-share-view` 헤더를 달아 루트 레이아웃이 미니멀 공개 셸을 렌더하고, 공유 호스트의 공유 외 경로는 `/share-blocked` 안내 페이지로 rewrite한다. 자산은 순수 `groupAssetsByKind`로 종류(OS/WEB/WAS/DB/기타)별로 묶어 ShareGate에서 2단(종류 칩→자산 칩) 선택으로 렌더한다.

**Tech Stack:** Next.js 16(App Router, `src/proxy.ts` nodejs 미들웨어), React 19, TypeScript strict, Vitest, Tailwind v4.

## Global Constraints

- `src/proxy.ts` 및 그것이 import하는 모듈은 better-sqlite3를 직·간접 import 금지(순수 로직만).
- 공유 뷰 판별 경로(오매칭 방지): `pathname === "/share"` || `pathname.startsWith("/share/")` || `pathname === "/share-blocked"`. (`/sharewolf` 등 제외.)
- 공유 호스트 공유 외 경로는 로그인 폼·내부 API를 렌더하지 않는다(핵심 은폐 유지). `/share-blocked` rewrite는 HTTP 상태 404 유지.
- 종류 순서 고정: OS→WEB→WAS→DB→기타(`os`,`web`,`was`,`db`,`other`). 라벨은 `ASSET_KIND_LABEL`.
- 스타일: `var(--color-*)` 아비트러리 표기 금지, 테마 유틸리티 사용. 미니멀 셸은 사이드바 오프셋 CSS(`.app-main`, `padding-left:16rem`)를 쓰지 않는다.
- 클라이언트가 보낸 `x-share-view` 헤더는 proxy가 매 요청 strip 후 자기 값만 세팅(기존 `x-public-route`와 동일 패턴).
- 실제 코드로 테스트(모의 최소화). 러너: `npx vitest run <파일>`. 각 태스크는 독립 검증 가능한 산출물로 끝낸다.

---

### Task 1: 종류별 그룹핑 순수 로직 (`groupByKind.ts`)

**Files:**
- Create: `src/lib/assets/groupByKind.ts`
- Test: `src/lib/assets/groupByKind.test.ts`

**Interfaces:**
- Consumes: `AssetKind`, `ASSET_KIND_LABEL` from `@/lib/assets/kind`.
- Produces:
  - `interface GroupableAsset { id: string; displayName: string; kind: AssetKind }`
  - `interface AssetKindGroup<T extends GroupableAsset> { kind: AssetKind; label: string; assets: T[] }`
  - `groupAssetsByKind<T extends GroupableAsset>(assets: T[]): AssetKindGroup<T>[]`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/assets/groupByKind.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { groupAssetsByKind } from "./groupByKind";

const a = (id: string, kind: "os" | "web" | "was" | "db" | "other") => ({
  id,
  displayName: id,
  kind,
});

describe("groupAssetsByKind", () => {
  it("returns [] for no assets", () => {
    expect(groupAssetsByKind([])).toEqual([]);
  });

  it("groups by kind and excludes empty kinds", () => {
    const groups = groupAssetsByKind([a("1", "db"), a("2", "os"), a("3", "db")]);
    expect(groups.map((g) => g.kind)).toEqual(["os", "db"]); // web/was/other 제외
    expect(groups.find((g) => g.kind === "db")!.assets.map((x) => x.id)).toEqual(["1", "3"]);
    expect(groups.find((g) => g.kind === "os")!.assets.map((x) => x.id)).toEqual(["2"]);
  });

  it("orders kinds OS→WEB→WAS→DB→기타 regardless of input order", () => {
    const groups = groupAssetsByKind([a("x", "other"), a("y", "web"), a("z", "os")]);
    expect(groups.map((g) => g.kind)).toEqual(["os", "web", "other"]);
  });

  it("attaches the Korean label and preserves within-group order", () => {
    const groups = groupAssetsByKind([a("b", "db"), a("a", "db")]);
    expect(groups[0].label).toBe("DB");
    expect(groups[0].assets.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/assets/groupByKind.test.ts`
Expected: FAIL — `Cannot find module './groupByKind'`

- [ ] **Step 3: 최소 구현 작성**

Create `src/lib/assets/groupByKind.ts`:

```typescript
import type { AssetKind } from "./kind";
import { ASSET_KIND_LABEL } from "./kind";

// 공유 뷰 자산 선택을 종류로 묶기 위한 순수 로직. 프로젝트 단위에서 자산 종류는
// 거의 고정이고 개수만 다르므로, 종류(OS/WEB/WAS/DB/기타)로 그룹핑해 가로 스크롤을 없앤다.
const KIND_ORDER: AssetKind[] = ["os", "web", "was", "db", "other"];

export interface GroupableAsset {
  id: string;
  displayName: string;
  kind: AssetKind;
}

export interface AssetKindGroup<T extends GroupableAsset> {
  kind: AssetKind;
  label: string;
  assets: T[];
}

// 고정 순서(OS→WEB→WAS→DB→기타)로, 자산이 하나라도 있는 종류만 반환한다.
// 그룹 내 자산 순서는 입력 순서를 유지한다.
export function groupAssetsByKind<T extends GroupableAsset>(assets: T[]): AssetKindGroup<T>[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: ASSET_KIND_LABEL[kind],
    assets: assets.filter((asset) => asset.kind === kind),
  })).filter((group) => group.assets.length > 0);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/assets/groupByKind.test.ts`
Expected: PASS (4 케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/assets/groupByKind.ts src/lib/assets/groupByKind.test.ts
git commit -m "feat: 자산 종류별 그룹핑 순수 로직 groupAssetsByKind"
```

---

### Task 2: 공유 API 응답에 자산 `kind` 추가

**Files:**
- Modify: `src/app/api/share/[token]/route.ts`

**Interfaces:**
- Consumes: `classifyAssetKind(asset)` from `@/lib/assets/kind` (반환 `AssetKind`).
- Produces: 공유 API `assets[]` 각 원소에 `kind: AssetKind` 필드 추가(기존 `id`,`displayName`,`type`,`verdict` 유지).

- [ ] **Step 1: import 추가**

`src/app/api/share/[token]/route.ts` 상단 import 블록에 추가:

```typescript
import { classifyAssetKind } from "@/lib/assets/kind";
```

- [ ] **Step 2: publicAssets 매핑에 kind 추가**

`const publicAssets = assets.map((asset) => ({ ... }))` 객체에 `kind` 줄을 추가한다(기존 `verdict:` 줄 아래):

```typescript
  const publicAssets = assets.map((asset) => ({
    id: asset.id,
    displayName: asset.displayName,
    type: asset.type,
    verdict: statusMap.get(asset.id)?.kind ?? "none",
    kind: classifyAssetKind(asset),
  }));
```

- [ ] **Step 3: 타입체크·전체 테스트로 검증**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 없음, 전체 테스트 PASS(회귀 없음).

- [ ] **Step 4: 커밋**

```bash
git add "src/app/api/share/[token]/route.ts"
git commit -m "feat: 공유 API 응답에 자산 종류(kind) 추가"
```

---

### Task 3: KindIcon export + ShareGate 종류 그룹 선택 UI

**Files:**
- Modify: `src/app/_components/AssetKindBadge.tsx` (KindIcon export)
- Modify: `src/app/share/[token]/ShareGate.tsx`

**Interfaces:**
- Consumes (Task 1): `groupAssetsByKind`, `AssetKindGroup`, `GroupableAsset`. (Task 2): 응답 자산의 `kind`.
- Consumes: `KindIcon`(신규 export), `AssetKind` from `@/lib/assets/kind`.

- [ ] **Step 1: `KindIcon`를 export로 전환**

`src/app/_components/AssetKindBadge.tsx`에서 로컬 `function KindIcon(...)` 선언을 `export function KindIcon(...)`로 바꾼다(구현 내용 변경 없음, 키워드만 추가).

- [ ] **Step 2: ShareGate에 kind 필드·import 추가**

`src/app/share/[token]/ShareGate.tsx`:

(a) import 블록에 추가:

```typescript
import type { AssetKind } from "@/lib/assets/kind";
import { groupAssetsByKind } from "@/lib/assets/groupByKind";
import { KindIcon } from "@/app/_components/AssetKindBadge";
```

(b) `ShareAsset` 인터페이스(현재 `assetId`/`displayName`/`verdict` 등)에서 실제로 쓰는 자산 타입에 `kind: AssetKind`를 추가한다. 공유 API 응답 자산 타입 정의(`assets: {...}[]`)에 `kind: AssetKind` 필드를 추가하면 된다. (id·displayName·verdict는 유지.)

- [ ] **Step 3: 종류/자산 선택 상태·파생값 추가**

컴포넌트 본문에서 `selectedAssetId` 상태 근처에 종류 상태를 추가하고, 그룹을 파생한다. `data`(인증 성공 후 자산 데이터)가 있는 스코프에서:

```typescript
  const [selectedKind, setSelectedKind] = useState<AssetKind | null>(null);
  const groups = groupAssetsByKind(data.assets);
  const activeKind = selectedKind ?? groups[0]?.kind ?? null;
  const activeGroup = groups.find((g) => g.kind === activeKind) ?? null;
```

자산 데이터를 처음 세팅하는 지점(현재 `setSelectedAssetId(json.assets[0]?.id ?? null)`)은 그대로 둔다 — `activeKind`/`activeGroup`이 첫 그룹으로 자동 파생되므로 초기 종류 선택은 별도 상태 세팅 없이 동작한다.

- [ ] **Step 4: 자산 목록 렌더를 2단 그룹 선택으로 교체**

`ShareGate.tsx`에서 현재의 자산 목록 블록(아래 "교체 전" 전체)을 "교체 후"로 바꾼다.

교체 전(현재 코드):

```tsx
            <div className="mb-4 -mx-1 overflow-x-auto px-1">
              <div className="flex gap-2 pb-1">
                {data.assets.map((asset) => {
                  const verdictBadge = VERDICT_BADGE[asset.verdict];
                  const active = asset.id === selectedAssetId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                        active ? "border-primary bg-surface font-semibold" : "border-border hover:bg-bg"
                      }`}
                    >
                      <span>{asset.displayName}</span>
                      <StatusBadge status={verdictBadge.status}>{verdictBadge.label}</StatusBadge>
                    </button>
                  );
                })}
              </div>
            </div>
```

교체 후:

```tsx
            {/* 종류 칩(아이콘+라벨+개수) — 종류 수가 적어 가로 스크롤 불필요 */}
            <div className="mb-3 flex flex-wrap gap-2">
              {groups.map((group) => {
                const active = group.kind === activeKind;
                return (
                  <button
                    key={group.kind}
                    type="button"
                    onClick={() => {
                      setSelectedKind(group.kind);
                      setSelectedAssetId(group.assets[0]?.id ?? null);
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      active ? "border-primary bg-surface font-semibold text-primary" : "border-border text-muted hover:bg-bg"
                    }`}
                  >
                    <KindIcon kind={group.kind} />
                    <span>{group.label}</span>
                    <span className="rounded bg-bg px-1.5 text-xs text-muted">{group.assets.length}</span>
                  </button>
                );
              })}
            </div>
            {/* 선택된 종류의 자산 칩 */}
            <div className="mb-4 flex flex-wrap gap-2">
              {(activeGroup?.assets ?? []).map((asset) => {
                const verdictBadge = VERDICT_BADGE[asset.verdict];
                const active = asset.id === selectedAssetId;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      active ? "border-primary bg-surface font-semibold" : "border-border hover:bg-bg"
                    }`}
                  >
                    <span>{asset.displayName}</span>
                    <StatusBadge status={verdictBadge.status}>{verdictBadge.label}</StatusBadge>
                  </button>
                );
              })}
            </div>
```

주의: `selectedAssetId`가 현재 activeGroup에 없을 수 있는 경우(초기값이 전체 첫 자산이라 첫 그룹 소속이면 일치)는 발생하지 않는다 — 초기 선택 자산이 곧 첫 그룹의 첫 자산이기 때문. 우측 `ShareReport` 렌더 블록(선택 자산 상세)은 변경하지 않는다.

- [ ] **Step 5: 타입체크·린트·빌드·전체 테스트로 검증**

Run: `npx tsc --noEmit && npx eslint "src/app/share/[token]/ShareGate.tsx" src/app/_components/AssetKindBadge.tsx && npx vitest run && npm run build`
Expected: 타입·린트 클린, 전체 테스트 PASS, 프로덕션 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/app/_components/AssetKindBadge.tsx "src/app/share/[token]/ShareGate.tsx"
git commit -m "feat: 공유 뷰 자산 선택을 종류별 그룹(종류 칩→자산 칩)으로 교체"
```

---

### Task 4: 공유 뷰 판별 헬퍼 + proxy `x-share-view` + 미니멀 셸

**Files:**
- Modify: `src/lib/projects/shareUrl.ts` (순수 헬퍼 `isShareViewPath`)
- Test: `src/lib/projects/shareUrl.test.ts` (헬퍼 테스트)
- Modify: `src/proxy.ts` (헤더 세팅)
- Modify: `src/app/layout.tsx` (셸 분기)

**Interfaces:**
- Produces: `isShareViewPath(pathname: string): boolean` — `"/share"` | `"/share/"`시작 | `"/share-blocked"`에서 true, 그 외 false.

- [ ] **Step 1: 실패 테스트 작성 (헬퍼)**

`src/lib/projects/shareUrl.test.ts`의 파일 끝에 describe 추가:

```typescript
import { isShareViewPath } from "./shareUrl";

describe("isShareViewPath (공유 뷰 셸 판별)", () => {
  it("is true for the share pages and the blocked page", () => {
    expect(isShareViewPath("/share")).toBe(true);
    expect(isShareViewPath("/share/abc123")).toBe(true);
    expect(isShareViewPath("/share-blocked")).toBe(true);
  });
  it("is false for other paths incl. near-misses", () => {
    expect(isShareViewPath("/")).toBe(false);
    expect(isShareViewPath("/login")).toBe(false);
    expect(isShareViewPath("/sharewolf")).toBe(false);
    expect(isShareViewPath("/api/share/x")).toBe(false);
  });
});
```

(파일 상단 import에 `isShareViewPath`를 추가하거나 위 인라인 import를 사용.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/projects/shareUrl.test.ts`
Expected: FAIL — `isShareViewPath is not a function` / not exported.

- [ ] **Step 3: 헬퍼 구현**

`src/lib/projects/shareUrl.ts` 끝에 추가:

```typescript
// 공유 뷰(미니멀 공개 셸로 렌더할 경로) 판별. 오매칭 방지를 위해 정확히 매칭한다:
// /share, /share/**, 그리고 안내 페이지 /share-blocked. (/sharewolf, /api/share/* 제외)
export function isShareViewPath(pathname: string): boolean {
  return pathname === "/share" || pathname.startsWith("/share/") || pathname === "/share-blocked";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/projects/shareUrl.test.ts`
Expected: PASS.

- [ ] **Step 5: proxy에 x-share-view 세팅**

`src/proxy.ts` import에 `isShareViewPath` 추가:

```typescript
import { isOnShareHost, isAllowedShareOnlyPath, isShareViewPath } from "@/lib/projects/shareUrl";
```

`headers.delete(PUBLIC_ROUTE_HEADER);` 다음 줄에 클라이언트 위조 방지 strip + 세팅을 추가한다(공유 호스트 게이트 `if` **앞**):

```typescript
  // 클라이언트가 보낸 x-share-view를 먼저 제거(레이아웃이 신뢰하는 헤더) 후,
  // 공유 뷰 경로에만 프록시가 직접 세팅한다 — 레이아웃은 이 헤더로 미니멀 셸을 고른다.
  headers.delete("x-share-view");
  if (isShareViewPath(pathname)) {
    headers.set("x-share-view", "1");
  }
```

- [ ] **Step 6: layout.tsx 셸 분기**

`src/app/layout.tsx`에서 `isPublicRoute` 계산 아래에 추가:

```typescript
  const isShareView = requestHeaders.get("x-share-view") === "1";
```

그리고 `<body>` 내부를 분기한다. 현재:

```tsx
      <body className="min-h-full">
        <AppSidebar />
        <div className="app-main flex min-h-screen flex-col">
          <AppHeader user={session ? { username: session.username } : null} />
          {children}
          {session && !isPublicRoute && <CveLiveToasts />}
        </div>
      </body>
```

교체 후(공유 뷰면 사이드바·관리자 헤더 없이 미니멀 브랜드 바만, `.app-main` 오프셋 없음):

```tsx
      <body className="min-h-full">
        {isShareView ? (
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-30 border-b border-border bg-surface">
              <div className="flex h-16 items-center px-4 md:px-8">
                <BrandLogo subtext />
              </div>
            </header>
            {children}
          </div>
        ) : (
          <>
            <AppSidebar />
            <div className="app-main flex min-h-screen flex-col">
              <AppHeader user={session ? { username: session.username } : null} />
              {children}
              {session && !isPublicRoute && <CveLiveToasts />}
            </div>
          </>
        )}
      </body>
```

`BrandLogo` import를 layout.tsx에 추가:

```typescript
import { BrandLogo } from "./_components/BrandLogo";
```

- [ ] **Step 7: 검증**

Run: `npx vitest run src/lib/projects/shareUrl.test.ts && npx tsc --noEmit && npx eslint src/proxy.ts src/app/layout.tsx src/lib/projects/shareUrl.ts && npm run build`
Expected: 테스트 PASS, 타입·린트 클린, 빌드 성공.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/projects/shareUrl.ts src/lib/projects/shareUrl.test.ts src/proxy.ts src/app/layout.tsx
git commit -m "feat: 공유 뷰에서 관리자 내비 숨김(proxy x-share-view + 미니멀 셸)"
```

---

### Task 5: `/share-blocked` 안내 페이지 + proxy rewrite + allowlist

**Files:**
- Create: `src/app/share-blocked/page.tsx`
- Modify: `src/lib/auth/constants.ts` (`isPublicPath` 허용)
- Modify: `src/lib/projects/shareUrl.ts` (`isAllowedShareOnlyPath` 허용)
- Modify: `src/proxy.ts` (404 → rewrite)
- Test: `src/proxy.test.ts` (rewrite 동작)

**Interfaces:**
- Consumes (Task 4): `isShareViewPath` (이미 `/share-blocked` 포함), proxy의 `x-share-view` 세팅.

- [ ] **Step 1: 안내 페이지 생성**

Create `src/app/share-blocked/page.tsx`:

```tsx
import { Card } from "@/app/_components/Card";

// 공개 공유 호스트에서 공유 외 경로 접근 시 proxy가 이 페이지로 rewrite한다(#share-ux).
// 로그인 폼·관리자 내용 없이 "열람 전용" 안내만 — 관리자 표면은 은폐 유지.
export default function ShareBlockedPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 items-center justify-center px-4 py-16 md:px-8">
      <Card bodyClassName="p-8 text-center">
        <h1 className="text-[20px] font-bold tracking-[-0.01em]">접근 권한이 없습니다</h1>
        <p className="mt-2 text-[14px] text-muted">
          이 링크는 공유된 점검 리포트 열람 전용입니다. 요청하신 페이지에는 접근할 수 없습니다.
        </p>
        <p className="mt-1 text-[13px] text-muted">
          점검 리포트는 담당자가 전달한 공유 링크로만 열람할 수 있습니다.
        </p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: 공개 경로 허용 (constants.ts)**

`src/lib/auth/constants.ts`의 `PUBLIC_EXACT_PATHS`에 `/share-blocked` 추가:

```typescript
const PUBLIC_EXACT_PATHS = new Set(["/login", "/api/auth/login", "/share-blocked"]);
```

- [ ] **Step 3: 공유 호스트 허용 경로 추가 (shareUrl.ts)**

현재 `isAllowedShareOnlyPath`는 prefix만 검사한다(`SHARE_ALLOWED_PREFIXES = ["/share/", "/api/share/"]`).
`/share-blocked`는 이 prefix에 안 걸리므로(끝에 슬래시 없음) exact 허용을 추가한다. `SHARE_ALLOWED_PREFIXES`
선언 아래에 exact 집합을 추가하고, 함수가 exact도 검사하도록 바꾼다:

```typescript
const SHARE_ALLOWED_PREFIXES = ["/share/", "/api/share/"];
const SHARE_ALLOWED_EXACT = new Set(["/share-blocked"]);

// 공개 공유 호스트에서 통과시킬 경로(공유 페이지·공유 API + 안내 페이지). 그 외는 proxy가 rewrite.
export function isAllowedShareOnlyPath(pathname: string): boolean {
  if (SHARE_ALLOWED_EXACT.has(pathname)) return true;
  return SHARE_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
```

최종 상태: `isAllowedShareOnlyPath("/share-blocked") === true`, `/share/x`·`/api/share/x`는 계속 true,
bare `/share`·`/api/share`·`/login` 등은 계속 false(회귀 없음).

- [ ] **Step 4: 실패 테스트 작성 (proxy rewrite)**

`src/proxy.test.ts`의 공유 호스트 describe에 추가:

```typescript
it("rewrites blocked paths on the share host to /share-blocked (404)", () => {
  const res = proxy(req(SHARE_HOST, "/login"));
  expect(res.status).toBe(404);
  expect(res.headers.get("x-middleware-rewrite")).toContain("/share-blocked");
});

it("still allows /share-blocked itself on the share host", () => {
  expect(proxy(req(SHARE_HOST, "/share-blocked")).status).toBe(200);
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL — 현재는 bare 404(`x-middleware-rewrite` 없음).

- [ ] **Step 6: proxy 게이트를 rewrite로 변경**

`src/proxy.ts`의 공유 호스트 게이트 블록을 교체:

```typescript
  if (
    isOnShareHost(request.headers.get("host"), request.headers.get("x-forwarded-host")) &&
    !isAllowedShareOnlyPath(pathname)
  ) {
    // bare 404 대신 친절한 안내 페이지로 rewrite(상태 404 유지 — 라우트 존재는 은폐).
    // 안내 페이지도 미니멀 셸이어야 하므로 x-share-view/public 헤더를 세팅해 전달한다.
    headers.set("x-share-view", "1");
    headers.set(PUBLIC_ROUTE_HEADER, "1");
    return NextResponse.rewrite(new URL("/share-blocked", request.url), {
      status: 404,
      request: { headers },
    });
  }
```

- [ ] **Step 7: 테스트 통과 확인 + 전체 검증**

Run: `npx vitest run src/proxy.test.ts && npx vitest run && npx tsc --noEmit && npx eslint src/proxy.ts src/lib/projects/shareUrl.ts src/lib/auth/constants.ts src/app/share-blocked/page.tsx && npm run build`
Expected: 신규 rewrite 테스트 PASS, 기존 게이트 테스트 회귀 없음, 전체 PASS, 타입·린트·빌드 클린.

- [ ] **Step 8: 커밋**

```bash
git add src/app/share-blocked/page.tsx src/lib/auth/constants.ts src/lib/projects/shareUrl.ts src/proxy.ts src/proxy.test.ts
git commit -m "feat: 공유 호스트 공유 외 경로를 /share-blocked 안내 페이지로 rewrite(404 유지)"
```

---

### Task 6: 실 ngrok E2E 검증 (수동)

코드 검증은 Task 1~5 단위/통합 테스트로 끝났다. 이 태스크는 실제 ngrok 고정 도메인으로 최종 확인이다(자동 아님). `.env`에 `SHARE_BASE_URL=https://<도메인>` 설정 후 `npm run build`(build-time 값) → `npm run start` → `ngrok http 3000 --url https://<도메인>`.

- [ ] **Step 1:** 공유 링크(`https://<도메인>/share/<유효토큰>`) 접속 → 비밀번호 통과 → **좌측 관리자 내비가 보이지 않고** 브랜드 바만 있는지 확인.
- [ ] **Step 2:** 자산이 **종류 칩(OS/WEB/WAS/DB) 한 줄**로 묶여 보이고, 종류 클릭 시 그 종류 자산 칩이 펼쳐지고, 자산 클릭 시 우측 리포트가 뜨는지 확인(가로 스크롤 없음).
- [ ] **Step 3:** `https://<도메인>/login`, `.../` 접속 → **"접근 권한이 없습니다" 안내 페이지**(내비·로그인 폼 없음)가 뜨는지 확인(HTTP 404).
- [ ] **Step 4:** localhost:3000 관리자 화면은 사이드바·기능 정상인지(회귀 없음) 확인.

---

## Self-Review

**Spec coverage (스펙 → 태스크):**
- 관리자 내비 숨김(1-A): proxy x-share-view + 레이아웃 미니멀 셸 → Task 4. ✓
- 안전망 안내 페이지(1-B): /share-blocked 페이지 + proxy rewrite + allowlist → Task 5. ✓
- 공유 API kind 추가(2-A) → Task 2. ✓
- 순수 그룹핑 로직(2-B) → Task 1. ✓
- ShareGate 2단 선택 UI(2-C) → Task 3. ✓
- 종류 순서 OS→…→기타, 첫 종류·첫 자산 자동 선택 → Task 1(순서), Task 3(자동 선택). ✓
- 오매칭 방지 경로 조건 → Task 4(isShareViewPath 테스트에 /sharewolf, /api/share/x 제외). ✓
- 테스트(groupByKind, proxy rewrite, isShareViewPath) → Task 1·4·5. ✓
- 실 검증 → Task 6. ✓

**Placeholder scan:** TBD/TODO/"적절히" 없음. 모든 코드 스텝에 실제 코드 존재. Task 5 Step 3은 현재 코드 상태에 따른 분기를 명시(플레이스홀더 아님 — 조건별 정확한 최종 상태 기술). ✓

**Type consistency:** `groupAssetsByKind`/`AssetKindGroup`/`GroupableAsset`(Task 1) 시그니처가 Task 3 사용처와 일치. `kind: AssetKind`가 Task 2(API)→Task 3(타입) 일관. `isShareViewPath`(Task 4) 시그니처가 proxy 사용처와 일치. `x-share-view` 헤더명이 Task 4·5·레이아웃에서 동일. ✓
