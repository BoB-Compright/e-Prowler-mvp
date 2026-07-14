# 자산 실질 구분 아이콘(리스트 뷰) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자산의 실질 종류(OS/WEB/WAS/DB/기타)를 분류해 자산 관리·프로젝트 상세·점검 이력 리스트에 아이콘+라벨로 표시하고, autodetect 스캔 결과로 레포 자산의 종류를 보정한다.

**Architecture:** 순수 분류 모듈 `assets/kind.ts`(이름 추론 + category 정규화 + 결과 도출)를 만들고, autodetect 스캔 종료 시 감지 종류를 레포 자산 `category`에 best-effort 저장한다. 표시는 `<AssetKindBadge>` 컴포넌트로 3개 리스트 뷰에 붙인다.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest, Tailwind v4, 인라인 SVG 아이콘.

## Global Constraints

- 테스트/타입/린트/빌드는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 실질 구분 어휘 5종: `os`/`web`/`was`/`db`/`other`, 라벨 `OS`/`WEB`/`WAS`/`DB`/`기타`.
- 서버 자산은 항상 선언 `category` 사용(이름 추론 안 함). 레포는 category 있으면 그걸, 없으면 이름 추론.
- 이름 추론 우선순위: WAS > WEB > DB > 런타임(→other) > OS 베이스 > other. (런타임이 OS보다 먼저.)
- 스캔 보정은 레포(type "repo") + assetId 있는 run에서만, best-effort(실패해도 스캔 흐름 불변). 레포 category는 스캔 계획에 영향 없음(autodetect 고정 오토셋).
- 아이콘은 기존 인라인 SVG 스타일(`stroke="currentColor"`, `viewBox="0 0 24 24"`, `strokeWidth={2}`, round cap/join) 재사용. 기존 디자인 토큰 사용.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: 분류 모듈 `assets/kind.ts`

**Files:**
- Create: `src/lib/assets/kind.ts`
- Test: `src/lib/assets/kind.test.ts`

**Interfaces:**
- Produces:
  - `type AssetKind = "os" | "web" | "was" | "db" | "other"`
  - `const ASSET_KIND_LABEL: Record<AssetKind, string>`
  - `categoryToKind(category: string | null): AssetKind`
  - `inferAssetKindFromName(name: string): AssetKind`
  - `classifyAssetKind(asset: Asset): AssetKind`
  - `detectKindFromResults(results: { id: string; status: string }[]): "OS" | "WEB" | "WAS" | "DB" | null`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/assets/kind.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";
import {
  ASSET_KIND_LABEL,
  categoryToKind,
  inferAssetKindFromName,
  classifyAssetKind,
  detectKindFromResults,
} from "./kind";
import type { Asset } from "./types";

function asset(over: Partial<Asset>): Asset {
  return {
    id: "a1", type: "repo", projectId: null, displayName: "", repoUrl: null, hostIp: null,
    hostname: null, sshPort: null, authType: null, username: null, encryptedSecret: null,
    os: null, owner: null, category: null, vendor: null, dockerfilePath: null, createdAt: "",
    ...over,
  } as Asset;
}

describe("ASSET_KIND_LABEL", () => {
  it("5종 라벨", () => {
    expect(ASSET_KIND_LABEL).toEqual({ os: "OS", web: "WEB", was: "WAS", db: "DB", other: "기타" });
  });
});

describe("categoryToKind", () => {
  it.each([
    ["OS", "os"], ["WEB", "web"], ["WAS", "was"], ["DB", "db"],
    [null, "other"], ["기타", "other"], ["nonsense", "other"],
  ])("%s → %s", (cat, kind) => {
    expect(categoryToKind(cat as string | null)).toBe(kind);
  });
});

describe("inferAssetKindFromName", () => {
  it.each([
    ["nhit-image/tomcat-9.0-jre25/Dockerfile", "was"],
    ["nhit-image/python-3.12.13-trixie/Dockerfile", "other"], // 런타임(python)이 OS(trixie)보다 우선
    ["nhit-image/debian-stable-slim/Dockerfile", "os"],
    ["nginx:1.27", "web"],
    ["httpd:2.4", "web"],
    ["mysql:8", "db"],
    ["postgres:16-alpine", "db"], // DB(postgres)가 OS(alpine)보다 우선
    ["redis:7", "db"],
    ["openjdk:21", "other"], // 런타임
    ["ubuntu:24.04", "os"],
    ["", "other"],
    ["some-unknown-thing", "other"],
  ])("%s → %s", (name, kind) => {
    expect(inferAssetKindFromName(name)).toBe(kind);
  });
});

describe("classifyAssetKind", () => {
  it("서버는 선언 category 사용", () => {
    expect(classifyAssetKind(asset({ type: "server", category: "WAS" }))).toBe("was");
    expect(classifyAssetKind(asset({ type: "server", category: null }))).toBe("other");
  });
  it("레포는 category 있으면 그걸(스캔 보정값)", () => {
    expect(classifyAssetKind(asset({ type: "repo", category: "DB", displayName: "tomcat-x" }))).toBe("db");
  });
  it("레포는 category 없으면 이름 추론(displayName→repoUrl→dockerfilePath)", () => {
    expect(classifyAssetKind(asset({ type: "repo", displayName: "tomcat-9" }))).toBe("was");
    expect(classifyAssetKind(asset({ type: "repo", displayName: "", repoUrl: "x/nginx/Dockerfile" }))).toBe("web");
  });
});

describe("detectKindFromResults", () => {
  it("WAS non-skip 있으면 WAS 우선", () => {
    expect(detectKindFromResults([
      { id: "WAS-01", status: "pass" }, { id: "WEB-01", status: "fail" }, { id: "U-01", status: "pass" },
    ])).toBe("WAS");
  });
  it("WAS 없고 WEB 있으면 WEB", () => {
    expect(detectKindFromResults([{ id: "WEB-01", status: "review" }, { id: "U-01", status: "pass" }])).toBe("WEB");
  });
  it("DB 단독", () => {
    expect(detectKindFromResults([{ id: "DB-01", status: "pass" }])).toBe("DB");
  });
  it("unix만 있으면 OS", () => {
    expect(detectKindFromResults([{ id: "U-01", status: "pass" }])).toBe("OS");
  });
  it("전부 skip이면 null", () => {
    expect(detectKindFromResults([{ id: "WEB-01", status: "skip" }, { id: "U-01", status: "skip" }])).toBeNull();
  });
  it("container(C-*)만 있으면 null(변별력 없음)", () => {
    expect(detectKindFromResults([{ id: "C-01", status: "pass" }])).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/assets/kind.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 모듈 구현**

`src/lib/assets/kind.ts` 생성:

```ts
import type { Asset } from "./types";
import { getCatalogItem } from "@/lib/catalog";

export type AssetKind = "os" | "web" | "was" | "db" | "other";

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  os: "OS",
  web: "WEB",
  was: "WAS",
  db: "DB",
  other: "기타",
};

// 대문자 category 문자열(OS/WEB/WAS/DB)을 kind로 정규화. 그 외/null → other.
export function categoryToKind(category: string | null): AssetKind {
  switch (category) {
    case "OS":
      return "os";
    case "WEB":
      return "web";
    case "WAS":
      return "was";
    case "DB":
      return "db";
    default:
      return "other";
  }
}

// 우선순위: 구체적 서비스(WAS>WEB>DB) > 런타임(→other) > OS 베이스 > other.
const NAME_RULES: { keywords: string[]; kind: AssetKind }[] = [
  { keywords: ["tomcat", "jboss", "wildfly", "weblogic", "jetty"], kind: "was" },
  { keywords: ["nginx", "apache", "httpd", "caddy", "haproxy"], kind: "web" },
  { keywords: ["mysql", "mariadb", "postgres", "redis", "mongo", "oracle", "mssql"], kind: "db" },
  { keywords: ["python", "node", "golang", "ruby", "php", "openjdk", "jre", "jdk", "dotnet", "rust"], kind: "other" },
  { keywords: ["debian", "ubuntu", "alpine", "centos", "rocky", "almalinux", "rhel", "fedora", "trixie", "bookworm", "bullseye", "busybox", "distroless", "scratch", "amazonlinux"], kind: "os" },
];

export function inferAssetKindFromName(name: string): AssetKind {
  const n = name.toLowerCase();
  for (const rule of NAME_RULES) {
    if (rule.keywords.some((k) => n.includes(k))) return rule.kind;
  }
  return "other";
}

export function classifyAssetKind(asset: Asset): AssetKind {
  if (asset.type === "server") return categoryToKind(asset.category);
  // repo: 스캔으로 보정된 category가 있으면 그걸, 없으면 이름 추론.
  if (asset.category) return categoryToKind(asset.category);
  return inferAssetKindFromName(asset.displayName || asset.repoUrl || asset.dockerfilePath || "");
}

// autodetect 스캔 결과에서 감지된 실질 종류를 도출한다. non-skip(pass/fail/review) 결과가 있는
// 카테고리를 WAS>WEB>DB>OS(unix) 우선순위로 선택. container(C-*)는 변별력 없어 제외. 없으면 null.
export function detectKindFromResults(
  results: { id: string; status: string }[],
): "OS" | "WEB" | "WAS" | "DB" | null {
  const present = new Set<string>();
  for (const r of results) {
    if (r.status === "skip") continue;
    const cat = getCatalogItem(r.id)?.category;
    if (cat) present.add(cat);
  }
  if (present.has("was")) return "WAS";
  if (present.has("web")) return "WEB";
  if (present.has("db")) return "DB";
  if (present.has("unix")) return "OS";
  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/assets/kind.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 클린.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/assets/kind.ts src/lib/assets/kind.test.ts
git commit -m "feat: 자산 실질 구분 분류(이름 추론·category 정규화·스캔 결과 도출)"
```

---

### Task 2: 스캔 보정 persist (store + 오케스트레이터 배선)

**Files:**
- Modify: `src/lib/assets/store.ts` (updateAssetCategory 추가)
- Modify: `src/lib/pipeline/orchestrator.ts` (saveCheckResults 직후 보정)
- Test: `src/lib/assets/store.test.ts`, `src/lib/pipeline/orchestrator.test.ts`

**Interfaces:**
- Consumes: `detectKindFromResults` (Task 1), `getAsset` (기존 store), `getRun` (기존 runs)
- Produces: `updateAssetCategory(assetId: string, category: string, db?: Database): void`

- [ ] **Step 1: 실패하는 테스트 작성 (store)**

`src/lib/assets/store.test.ts`에 추가. 기존 테스트가 `createInMemoryDb()`로 `db`를 만들고
`createRepoAsset({ displayName, repoUrl }, db)`를 쓴다(둘 다 이미 import됨). import에 `updateAssetCategory` 추가:

```ts
import { updateAssetCategory } from "./store";

describe("updateAssetCategory", () => {
  it("자산 category를 갱신한다", () => {
    const a = createRepoAsset({ displayName: "img", repoUrl: "https://github.com/nh/svc" }, db);
    expect(getAsset(a.id, db)!.category).toBeNull();
    updateAssetCategory(a.id, "WAS", db);
    expect(getAsset(a.id, db)!.category).toBe("WAS");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/assets/store.test.ts`
Expected: FAIL — `updateAssetCategory` 미정의.

- [ ] **Step 3: updateAssetCategory 구현**

`src/lib/assets/store.ts`에 추가(다른 export 함수 옆, `getAsset`/`deleteAsset` 근처):

```ts
export function updateAssetCategory(assetId: string, category: string, db: Database = getDb()): void {
  db.prepare(`UPDATE assets SET category = ? WHERE id = ?`).run(category, assetId);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/assets/store.test.ts`
Expected: PASS.

- [ ] **Step 5: 실패하는 테스트 작성 (오케스트레이터 보정)**

`src/lib/pipeline/orchestrator.test.ts`의 `describe("runPipeline", …)`에 추가. 이 파일에서 `deps.runChecks`가
resolve하는 배열이 그대로 `saveCheckResults`로 저장되는 `results`다(baseDeps 기본값은 C-01/C-02/U-16).
따라서 `runChecks`를 오버라이드해 감지 종류를 제어한다. `createRepoAsset`/`getAsset`은 store에서 import
필요(상단 import에 추가). 두 케이스:

```ts
import { createRepoAsset, getAsset } from "@/lib/assets/store";

  it("autodetect 스캔이 감지한 WAS를 repo 자산 category에 보정 저장한다", async () => {
    const asset = createRepoAsset({ displayName: "svc", repoUrl: "https://github.com/nh/svc" }, db);
    const run = createRun(asset.repoUrl!, "git", asset.id, db);
    const deps = baseDeps();
    deps.runChecks = vi.fn().mockResolvedValue([
      { id: "WAS-01", status: "pass", evidence: "" },
      { id: "U-16", status: "pass", evidence: "" },
    ]);
    await runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! }, deps, db);
    expect(getAsset(asset.id, db)!.category).toBe("WAS");
  });

  it("감지 종류가 없으면(컨테이너만) category를 null로 유지한다", async () => {
    const asset = createRepoAsset({ displayName: "svc2", repoUrl: "https://github.com/nh/svc2" }, db);
    const run = createRun(asset.repoUrl!, "git", asset.id, db);
    const deps = baseDeps();
    deps.runChecks = vi.fn().mockResolvedValue([{ id: "C-01", status: "pass", evidence: "" }]);
    await runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! }, deps, db);
    expect(getAsset(asset.id, db)!.category).toBeNull();
  });
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline/orchestrator.test.ts`
Expected: FAIL — 보정 미구현이라 category가 null.

- [ ] **Step 7: 오케스트레이터에 보정 배선**

`src/lib/pipeline/orchestrator.ts`:
import 추가:
```ts
import { getRun } from "./runs";
import { getAsset, updateAssetCategory } from "@/lib/assets/store";
import { detectKindFromResults } from "@/lib/assets/kind";
```
`saveCheckResults(runId, results, db);`(238행) **직후**에 best-effort 보정 블록 추가:
```ts
    saveCheckResults(runId, results, db);
    // autodetect 스캔 결과로 레포 자산의 실질 구분을 보정 저장(best-effort — 실패해도 스캔 불변).
    try {
      const assetId = getRun(runId, db)?.assetId;
      if (assetId) {
        const asset = getAsset(assetId, db);
        if (asset?.type === "repo") {
          const detected = detectKindFromResults(results);
          if (detected) updateAssetCategory(assetId, detected, db);
        }
      }
    } catch {
      /* 보정 실패는 무시 */
    }
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/assets/store.test.ts src/lib/pipeline/orchestrator.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 클린.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/assets/store.ts src/lib/assets/store.test.ts src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts
git commit -m "feat: autodetect 스캔 후 레포 자산 실질 구분 보정 저장(best-effort)"
```

---

### Task 3: `<AssetKindBadge>` 컴포넌트

**Files:**
- Create: `src/app/_components/AssetKindBadge.tsx`

**Interfaces:**
- Consumes: `AssetKind`, `ASSET_KIND_LABEL` (Task 1)
- Produces: `<AssetKindBadge kind={AssetKind} />`

- [ ] **Step 1: 컴포넌트 구현**

`src/app/_components/AssetKindBadge.tsx` 생성. 5개 kind별 인라인 SVG(기존 navItems.tsx 스타일) + 라벨:

```tsx
import type { AssetKind } from "@/lib/assets/kind";
import { ASSET_KIND_LABEL } from "@/lib/assets/kind";

const svgProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function KindIcon({ kind }: { kind: AssetKind }) {
  switch (kind) {
    case "os": // 모니터
      return (
        <svg {...svgProps}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "web": // 지구본
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
      );
    case "was": // 톱니
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </svg>
      );
    case "db": // 원통
      return (
        <svg {...svgProps}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </svg>
      );
    default: // 기타 — 상자
      return (
        <svg {...svgProps}>
          <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
        </svg>
      );
  }
}

// 자산의 실질 구분을 아이콘+짧은 라벨로 표시. 큰 구분(레포/서버)과 별개.
export function AssetKindBadge({ kind }: { kind: AssetKind }) {
  const label = ASSET_KIND_LABEL[kind];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] text-muted"
      title={`실질 구분: ${label}`}
    >
      <KindIcon kind={kind} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: 정적 검증**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint src/app/_components/AssetKindBadge.tsx`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/app/_components/AssetKindBadge.tsx
git commit -m "feat: AssetKindBadge — 실질 구분 아이콘+라벨(5종 인라인 SVG)"
```

---

### Task 4: 3개 리스트 뷰에 배지 배선

**Files:**
- Modify: `src/app/assets/AssetTable.tsx` (AssetRowData.kind + 종류 셀)
- Modify: `src/app/assets/page.tsx` (row 빌드에 kind)
- Modify: `src/app/projects/[id]/page.tsx` (row 빌드에 kind)
- Modify: `src/app/runs/page.tsx` (점검 대상 열에 배지)

**Interfaces:**
- Consumes: `classifyAssetKind`, `AssetKind` (Task 1); `<AssetKindBadge>` (Task 3).

- [ ] **Step 1: AssetTable에 kind 필드 + 종류 셀 배지**

`src/app/assets/AssetTable.tsx`:
import 추가:
```tsx
import type { AssetKind } from "@/lib/assets/kind";
import { AssetKindBadge } from "../_components/AssetKindBadge";
```
`AssetRowData` 인터페이스에 `typeLabel` 다음 줄 추가:
```ts
  typeLabel: string; // "레포" | "서버"
  kind: AssetKind; // 실질 구분(OS/WEB/WAS/DB/기타)
```
기존 "종류" 셀(`<td className="px-5 py-3 text-muted">{row.typeLabel}</td>`, 273행)을 아래로 교체(큰 구분 + 실질 구분 병기):
```tsx
                <td className="px-5 py-3">
                  <span className="text-muted">{row.typeLabel}</span>
                  <span className="mt-0.5 block">
                    <AssetKindBadge kind={row.kind} />
                  </span>
                </td>
```

- [ ] **Step 2: assets/page.tsx row 빌드에 kind**

`src/app/assets/page.tsx`: import 추가
```tsx
import { classifyAssetKind } from "@/lib/assets/kind";
```
`assets.map((asset) => { ... })`에서 반환 객체에 `typeLabel` 다음 줄 추가:
```tsx
              typeLabel: asset.type === "repo" ? "레포" : "서버",
              kind: classifyAssetKind(asset),
```

- [ ] **Step 3: projects/[id]/page.tsx row 빌드에 kind**

`src/app/projects/[id]/page.tsx`: import 추가
```tsx
import { classifyAssetKind } from "@/lib/assets/kind";
```
자산 row 빌드(`typeLabel: asset.type === "repo" ? "레포" : "서버",`, 65행)에 다음 줄 추가:
```tsx
              typeLabel: asset.type === "repo" ? "레포" : "서버",
              kind: classifyAssetKind(asset),
```

- [ ] **Step 4: 점검 이력(runs/page.tsx) 점검 대상 열에 배지**

`src/app/runs/page.tsx`: import 추가
```tsx
import { classifyAssetKind } from "@/lib/assets/kind";
import { AssetKindBadge } from "../_components/AssetKindBadge";
```
"점검 대상" 셀에서 자산명 Link 아래(`id.label` Link가 있는 `<td>` 내부, 자산 매핑이 있는 경우)에 배지를
추가한다. run→asset은 기존 `assetsById[run.assetId]` 사용(이 페이지에 이미 있는 map). 자산이 있을 때만:
```tsx
                      <td className="px-5 py-3">
                        <Link
                          href={run.status === "running" ? `/runs/${run.id}` : `/runs/${run.id}/report`}
                          className="font-mono font-bold hover:underline"
                        >
                          {id.label}
                        </Link>
                        {run.assetId && assetsById[run.assetId] ? (
                          <span className="mt-0.5 block">
                            <AssetKindBadge kind={classifyAssetKind(assetsById[run.assetId])} />
                          </span>
                        ) : null}
```
(주: `assetsById`의 실제 변수명·형태는 이 파일에서 이미 쓰는 것을 확인해 그대로 사용. 없으면 기존 자산
매핑 방식을 따른다. 기존 자산명 하위 링크(secondary) 구조는 유지하고 그 근처에 배지를 배치한다.)

- [ ] **Step 5: 정적 검증 + 빌드**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/assets/AssetTable.tsx" "src/app/assets/page.tsx" "src/app/projects/[id]/page.tsx" "src/app/runs/page.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 6: 전체 테스트 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run 2>&1 | tail -3`
Expected: 전부 통과.

```bash
git add "src/app/assets/AssetTable.tsx" "src/app/assets/page.tsx" "src/app/projects/[id]/page.tsx" "src/app/runs/page.tsx"
git commit -m "feat: 자산 관리·프로젝트·점검 이력 리스트에 실질 구분 배지 표시"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 자산 관리 목록: 서버는 선언 종류, 레포는 이름 추론(예: tomcat→WAS, debian-slim→OS, python→기타) 배지 확인.
- autodetect 스캔 1회 후 해당 레포 자산의 배지가 감지 종류로 보정되는지 확인.
- 프로젝트 상세·점검 이력 목록에도 배지가 기존 디자인과 어울리게 표시되는지 확인.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul) + 공개 URL 200 확인.
