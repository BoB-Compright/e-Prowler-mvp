# Windows 벤더 팩 + WinRM 경로 (#4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Windows 벤더(IIS/MSSQL/WebLogic/WebSphere)·Windows Server OS의 벤더 팩 `windows` 실행경로를 완성한다(카탈로그 기준 + os-windows 베이스라인 라우팅 + review-pending, 실제점검 보류, WinRM 스캐폴드).

**Architecture:** 신규 category `"windows"` + WIN/MSSQL/WLS/WSP CIS 카탈로그. os-windows 및 web-iis/db-mssql/was-weblogic/was-websphere 팩(모두 `executionPath:"windows"`, review-pending). `resolveCheckPlan`이 Windows 자산을 os-windows 베이스라인으로 라우팅. WinRM 러너 스텁.

**Tech Stack:** TypeScript, better-sqlite3, vitest.

## Global Constraints

- Node 24 테스트; 게이트 tsc+eslint+vitest.
- 출처 CIS 대등, 불확실 `(항목 확인 필요)`. IIS는 WEB(KISA) 재사용(신규 항목 없음).
- windows 팩은 `evaluatePack`(#0)이 전부 review("Windows 호스트 연결 대기")로 단락 → 평가기 미호출. 팩은 최소(evidenceTasks []·detect ()=>false·evaluate ()=>[]).
- 기존 Linux 팩/엔진 동작 불변(라우팅 추가 외). 실제 WinRM 점검 보류(스캐폴드만).

---

## Task 1: Category "windows" + os-windows(WIN) 카탈로그

**Files:** Modify `src/lib/catalog/types.ts`, `src/lib/catalog/index.ts`, Create `src/lib/catalog/data/cis/windows.json`, Test `src/lib/catalog/index.test.ts`

**Interfaces:** Produces `Category` 유니온에 `"windows"`; `getCatalogByCategory("windows")` → WIN-01~10(CIS).

- [ ] **Step 1: 실패 테스트** — `index.test.ts`:

```ts
it("has 10 CIS-sourced Windows(WIN-*) items in the windows category", () => {
  const win = getCatalogByCategory("windows");
  expect(win).toHaveLength(10);
  expect(win.every((i) => i.frameworkId === "cis")).toBe(true);
  expect(win.map((i) => i.id)).toContain("WIN-01");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 타입 + 라벨** — `src/lib/catalog/types.ts`:
  - `export type Category = "container" | "unix" | "web" | "was" | "db" | "windows";`
  - `CATEGORY_LABELS`에 `windows: "Windows 서버 (CIS 기반)"` 추가.

- [ ] **Step 4: 데이터** — `src/lib/catalog/data/cis/windows.json` (10항목). 형식은 기존 CIS 데이터와 동일:

```json
[
  { "id": "WIN-01", "title": "관리자 계정 이름 변경/기본 계정 관리", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - default accounts (항목 확인 필요)" } },
  { "id": "WIN-02", "title": "계정 잠금 정책", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - account lockout (항목 확인 필요)" } },
  { "id": "WIN-03", "title": "암호 정책(복잡도/길이/이력)", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - password policy (항목 확인 필요)" } },
  { "id": "WIN-04", "title": "감사 정책(로그온/권한 사용 등)", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - audit policy (항목 확인 필요)" } },
  { "id": "WIN-05", "title": "불필요한 서비스 비활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - unnecessary services (항목 확인 필요)" } },
  { "id": "WIN-06", "title": "SMBv1 비활성화", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - SMBv1 disabled (항목 확인 필요)" } },
  { "id": "WIN-07", "title": "원격 데스크톱(RDP) NLA 강제", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - RDP NLA (항목 확인 필요)" } },
  { "id": "WIN-08", "title": "Windows 방화벽 활성화", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - firewall enabled (항목 확인 필요)" } },
  { "id": "WIN-09", "title": "UAC 활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - UAC (항목 확인 필요)" } },
  { "id": "WIN-10", "title": "보안 패치 최신화", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Windows Server Benchmark - patch level (항목 확인 필요)" } }
]
```

- [ ] **Step 5: 등록** — `src/lib/catalog/index.ts`: `import windowsData from "./data/cis/windows.json";` + `CATALOG_SOURCES`에 `{ frameworkId: "cis", category: "windows", data: windowsData as RawItem[] }`. `getCatalogSummary`의 `byCategory`가 category별 카운트를 명시 나열하면 `windows` 추가. 카탈로그 총계 테스트 있으면 150→160.

- [ ] **Step 6: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/catalog/types.ts src/lib/catalog/index.ts src/lib/catalog/data/cis/windows.json src/lib/catalog/index.test.ts
git commit -m "feat: windows category + WIN(CIS) 카탈로그 10항목 (#windows)"
```

  주의: `getCatalogSummary`(index.ts)가 `byCategory: { container, unix, web, was, db }`를 하드코딩하면 `windows: getCatalogByCategory("windows").length` 추가. `/catalog` 페이지의 `CATEGORIES` 배열·FilterPanel의 `CATEGORIES`에도 `"windows"`를 추가(안 하면 카탈로그 UI에서 windows 섹션 미표시 — tsc는 통과하나 노출 안 됨). 이 UI 배열 갱신도 이 태스크에 포함.

---

## Task 2: MSSQL / WLS / WSP 카탈로그 추가

**Files:** Modify `src/lib/catalog/data/cis/db.json`, `src/lib/catalog/data/cis/was.json`, Test `src/lib/catalog/index.test.ts`

**Interfaces:** db category에 MSSQL-01~10, was category에 WLS-01~08 + WSP-01~08 추가.

- [ ] **Step 1: 실패 테스트** — `index.test.ts`:

```ts
it("db has MSSQL-*, was has WLS-*/WSP-*", () => {
  const db = getCatalogByCategory("db").map((i) => i.id);
  const was = getCatalogByCategory("was").map((i) => i.id);
  expect(db.filter((i) => i.startsWith("MSSQL-"))).toHaveLength(10);
  expect(was.filter((i) => i.startsWith("WLS-"))).toHaveLength(8);
  expect(was.filter((i) => i.startsWith("WSP-"))).toHaveLength(8);
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 데이터 추가** — `db.json` 끝(ORA-12 뒤 `,`)에 MSSQL-01~10 추가. `was.json` 끝(WAS-12 뒤 `,`)에 WLS-01~08, WSP-01~08 추가. 각 항목 형식 동일(`{id,title,severity,automationStatus,source}`), `source.framework:"CIS"`, ref는 각각 `SQL Server Benchmark - ... (항목 확인 필요)`, `Oracle WebLogic Benchmark - ... (항목 확인 필요)`, `WebSphere Application Server 하드닝 - ... (항목 확인 필요)`. 대표 제목(각 벤더 핵심 통제):
  - **MSSQL-01~10**: sa 계정 비활성/이름변경, 인증 모드(Windows 인증), 원격 접속 제한, 로그인 감사, 서비스 계정 최소권한, xp_cmdshell 비활성, 네트워크 암호화(Force Encryption), 최신 CU/패치, 데이터 파일 권한, 기본 포트/노출.
  - **WLS-01~08**: 관리 콘솔 보안(SSL), 기본 관리자 계정, 프로덕션 모드, 감사 프로바이더, 노드매니저 보안, 비밀번호 정책, JMX/원격 접근 제한, 패치(PSU).
  - **WSP-01~08**: 관리 보안 활성화, 전역 보안(Global Security), 기본 계정, 애플리케이션 보안, SSL/TLS, 감사, 세션 보안, 픽스팩.
  카탈로그 총계 테스트 있으면 160→186(+26).

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/catalog/data/cis/db.json src/lib/catalog/data/cis/was.json src/lib/catalog/index.test.ts
git commit -m "feat: MSSQL/WebLogic/WebSphere CIS 카탈로그 추가 (#windows)"
```

---

## Task 3: os-windows 팩 + resolveCheckPlan windows 라우팅 (엔진 핵심)

**Files:** Create `src/lib/packs/osWindows.ts`, Modify `src/lib/packs/resolve.ts`, `src/lib/packs/registry.ts`, Test `src/lib/packs/osWindows.test.ts`, `src/lib/packs/resolve.test.ts`, `src/lib/packs/registry.test.ts`

**Interfaces:**
- Produces: `osWindowsPack: VendorPack`(id `os-windows`, category `OS`, vendors `["Windows Server"]`, executionPath `windows`, itemIds=WIN-*, evidenceTasks [], detect ()=>false, evaluate ()=>[]). `resolveCheckPlan`이 Windows 자산을 os-windows로 라우팅.

- [ ] **Step 1: 실패 테스트** — `osWindows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { osWindowsPack } from "./osWindows";
import { evaluatePack } from "./resolve";
import { getCatalogByCategory } from "@/lib/catalog";

describe("osWindowsPack", () => {
  it("is a windows-path pack owning WIN-* items", () => {
    const winIds = getCatalogByCategory("windows").map((i) => i.id).sort();
    expect(osWindowsPack.id).toBe("os-windows");
    expect(osWindowsPack.category).toBe("OS");
    expect(osWindowsPack.vendors).toEqual(["Windows Server"]);
    expect(osWindowsPack.executionPath).toBe("windows");
    expect(osWindowsPack.itemIds.slice().sort()).toEqual(winIds);
  });
  it("evaluatePack returns all WIN-* as review (host pending)", () => {
    const results = evaluatePack(osWindowsPack, { findings: null, tasks: [] });
    expect(results.every((r) => r.status === "review")).toBe(true);
    expect(results[0].evidence).toMatch(/Windows 호스트 연결 대기/);
  });
});
```
  `resolve.test.ts`에 라우팅 테스트 추가:

```ts
it("server + OS/Windows Server → [os-windows] (not os-unix)", () => {
  const asset = { ...base, type: "server", category: "OS", vendor: "Windows Server" } as Asset;
  expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-windows"]);
});
it("Linux OS/Ubuntu still → [os-unix] (no regression)", () => {
  const asset = { ...base, type: "server", category: "OS", vendor: "Ubuntu" } as Asset;
  expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-unix"]);
});
```
  `registry.test.ts`: `findVendorPack("OS","Windows Server")?.id === "os-windows"`; `ALL_PACKS`에 `os-windows` 포함.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: os-windows 팩** — `src/lib/packs/osWindows.ts`:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import type { VendorPack } from "./types";

// 실제 점검은 WinRM 호스트 확보 시(#4 보류). executionPath "windows"라 evaluatePack이
// 항목 전부를 review("Windows 호스트 연결 대기")로 처리하며 evaluate는 호출되지 않는다.
export const osWindowsPack: VendorPack = {
  id: "os-windows",
  category: "OS",
  vendors: ["Windows Server"],
  executionPath: "windows",
  itemIds: getCatalogByCategory("windows").map((i) => i.id),
  evidenceTasks: [],
  detect: () => false,
  evaluate: () => [],
};
```

- [ ] **Step 4: resolveCheckPlan 라우팅** — `src/lib/packs/resolve.ts`의 `resolveCheckPlan`을 교체:

```ts
import { osWindowsPack } from "./osWindows";

export function resolveCheckPlan(asset: Asset): CheckPlan {
  const packs: VendorPack[] = [];
  const linuxBaseline = asset.type === "server" ? osUnixPack : containerPack;

  if (asset.category === "OS") {
    // OS 벤더 팩(os-windows 등) 매칭 시 그것만; 아니면 Linux 베이스라인.
    const osVp = asset.vendor ? findVendorPack("OS", asset.vendor) : undefined;
    packs.push(osVp ?? linuxBaseline);
  } else {
    const vendorPack =
      asset.category && asset.vendor ? findVendorPack(asset.category, asset.vendor) : undefined;
    // 벤더 팩이 windows 경로면 호스트도 Windows이므로 os-windows 베이스라인을 쓴다.
    const baseline = vendorPack?.executionPath === "windows" ? osWindowsPack : linuxBaseline;
    packs.push(baseline);
    if (vendorPack) packs.push(vendorPack);
  }

  const evidenceTasks = mergeEvidenceTasks(packs.map((p) => p.evidenceTasks));
  return { packs, evidenceTasks };
}
```
  `registry.ts`: `import { osWindowsPack } from "./osWindows";` + `ALL_PACKS`에 추가.

- [ ] **Step 5: 통과 + 전체 스위트** — `npx vitest run` → PASS(기존 resolve 테스트 회귀 없음: server+WEB/Nginx→[os-unix,web-nginx], repo→[container], server+OS/Ubuntu→[os-unix], DB/MySQL→[os-unix,db-mysql] 모두 유지).

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/packs/osWindows.ts src/lib/packs/resolve.ts src/lib/packs/registry.ts
git add src/lib/packs/osWindows.ts src/lib/packs/resolve.ts src/lib/packs/registry.ts src/lib/packs/osWindows.test.ts src/lib/packs/resolve.test.ts src/lib/packs/registry.test.ts
git commit -m "feat: os-windows 팩 + resolveCheckPlan windows 베이스라인 라우팅 (#windows)"
```

---

## Task 4: Windows 애플리케이션 팩 (web-iis, db-mssql, was-weblogic, was-websphere)

**Files:** Create `src/lib/packs/windowsApps.ts`, Modify `src/lib/packs/registry.ts`, Test `src/lib/packs/windowsApps.test.ts`, `src/lib/packs/resolve.test.ts`, `src/lib/packs/registry.test.ts`

**Interfaces:** Produces `webIisPack`, `dbMssqlPack`, `wasWeblogicPack`, `wasWebspherePack`(모두 executionPath windows, review-pending).

- [ ] **Step 1: 실패 테스트** — `windowsApps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { webIisPack, dbMssqlPack, wasWeblogicPack, wasWebspherePack } from "./windowsApps";
import { evaluatePack } from "./resolve";
import { getCatalogByCategory } from "@/lib/catalog";

const webIds = () => getCatalogByCategory("web").map((i) => i.id).sort();
const byPrefix = (cat: "db" | "was", p: string) =>
  getCatalogByCategory(cat).map((i) => i.id).filter((id) => id.startsWith(p)).sort();

describe("windows app packs", () => {
  it("web-iis reuses WEB catalog, windows path", () => {
    expect(webIisPack.id).toBe("web-iis");
    expect(webIisPack.category).toBe("WEB");
    expect(webIisPack.vendors).toEqual(["IIS"]);
    expect(webIisPack.executionPath).toBe("windows");
    expect(webIisPack.itemIds.slice().sort()).toEqual(webIds());
  });
  it("db-mssql owns MSSQL-*, was-weblogic WLS-*, was-websphere WSP-*", () => {
    expect(dbMssqlPack.itemIds.slice().sort()).toEqual(byPrefix("db", "MSSQL-"));
    expect(wasWeblogicPack.itemIds.slice().sort()).toEqual(byPrefix("was", "WLS-"));
    expect(wasWebspherePack.itemIds.slice().sort()).toEqual(byPrefix("was", "WSP-"));
  });
  it("all are review-pending via evaluatePack", () => {
    for (const p of [webIisPack, dbMssqlPack, wasWeblogicPack, wasWebspherePack]) {
      const r = evaluatePack(p, { findings: null, tasks: [] });
      expect(r.length).toBe(p.itemIds.length);
      expect(r.every((x) => x.status === "review")).toBe(true);
    }
  });
});
```
  `registry.test.ts`: `findVendorPack("WEB","IIS")?.id==="web-iis"`, `("DB","MSSQL")==="db-mssql"`, `("WAS","WebLogic")==="was-weblogic"`, `("WAS","WebSphere")==="was-websphere"`; `ALL_PACKS`에 4개 포함.
  `resolve.test.ts`: `server+WEB/IIS → ["os-windows","web-iis"]`; `server+DB/MSSQL → ["os-windows","db-mssql"]`.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `src/lib/packs/windowsApps.ts`:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import type { VendorPack } from "./types";

// 모두 executionPath "windows" — 실제 점검은 WinRM 호스트 확보 시(보류). evaluatePack이
// 항목을 review("Windows 호스트 연결 대기")로 단락하므로 evaluate는 호출되지 않는다.
function windowsPack(
  id: string,
  category: VendorPack["category"],
  vendors: string[],
  itemIds: string[],
): VendorPack {
  return { id, category, vendors, executionPath: "windows", itemIds, evidenceTasks: [], detect: () => false, evaluate: () => [] };
}

const web = () => getCatalogByCategory("web").map((i) => i.id);
const dbBy = (p: string) => getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith(p));
const wasBy = (p: string) => getCatalogByCategory("was").map((i) => i.id).filter((id) => id.startsWith(p));

export const webIisPack = windowsPack("web-iis", "WEB", ["IIS"], web());
export const dbMssqlPack = windowsPack("db-mssql", "DB", ["MSSQL"], dbBy("MSSQL-"));
export const wasWeblogicPack = windowsPack("was-weblogic", "WAS", ["WebLogic"], wasBy("WLS-"));
export const wasWebspherePack = windowsPack("was-websphere", "WAS", ["WebSphere"], wasBy("WSP-"));
```
  `registry.ts`: import 4개 + `ALL_PACKS`에 추가.

- [ ] **Step 4: 통과 + 전체 스위트** — `npx vitest run` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/packs/windowsApps.ts src/lib/packs/registry.ts
git add src/lib/packs/windowsApps.ts src/lib/packs/registry.ts src/lib/packs/windowsApps.test.ts src/lib/packs/resolve.test.ts src/lib/packs/registry.test.ts
git commit -m "feat: Windows 앱 팩 web-iis/db-mssql/was-weblogic/was-websphere (#windows)"
```

---

## Task 5: WinRM 실행 어댑터 스캐폴드

**Files:** Create `src/lib/checks/winrmRunner.ts`, Test `src/lib/checks/winrmRunner.test.ts`

**Interfaces:** Produces `runWinrmChecks(asset, extraTasks): Promise<never>` 스텁(미구현 명시).

- [ ] **Step 1: 실패 테스트** — `winrmRunner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runWinrmChecks, WINRM_NOT_IMPLEMENTED } from "./winrmRunner";

describe("winrmRunner (scaffold)", () => {
  it("throws a clear not-implemented error until a Windows host/WinRM is wired", async () => {
    await expect(runWinrmChecks()).rejects.toThrow(WINRM_NOT_IMPLEMENTED);
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `src/lib/checks/winrmRunner.ts`:

```ts
// WinRM 기반 Windows 점검 실행 진입점(스캐폴드). #4에서 Windows 벤더 팩은
// executionPath "windows"로 등록돼 evaluatePack이 결과를 "Windows 호스트 연결 대기"
// review로 단락하므로, 이 러너는 아직 파이프라인에서 호출되지 않는다. Windows 호스트/
// WinRM 자격증명이 확보되면 여기서 ansible(community.windows/winrm) 또는 직접 WinRM으로
// 증거를 수집하도록 구현한다(별도 사이클).
export const WINRM_NOT_IMPLEMENTED =
  "WinRM 실행 경로 미구현: Windows 호스트/자격증명 확보 후 구현 예정";

export async function runWinrmChecks(): Promise<never> {
  throw new Error(WINRM_NOT_IMPLEMENTED);
}
```

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/checks/winrmRunner.ts src/lib/checks/winrmRunner.test.ts
git add src/lib/checks/winrmRunner.ts src/lib/checks/winrmRunner.test.ts
git commit -m "feat: WinRM 실행 어댑터 스캐폴드(미구현 스텁) (#windows)"
```

---

## Task 6: 검증 (라우팅·review-pending·카탈로그, 실제점검 보류)

**Files:** (검증. 버그 발견 시 최소 수정 후 별도 커밋.)

- [ ] **Step 1: 전체 단위 테스트 그린** — `npx vitest run` PASS.
- [ ] **Step 2: 라우팅/review-pending(실 Windows 없이, tsx)** — 임의 서버 자산을 override해 실제 프로덕션 경로로 확인:
  - OS/Windows Server → packs=[os-windows], WIN-* 전부 review("Windows 호스트 연결 대기"), U-* 안 나옴.
  - WEB/IIS → packs=[os-windows, web-iis], WEB-* + WIN-* 전부 review.
  - DB/MSSQL → packs=[os-windows, db-mssql], MSSQL-* + WIN-* review, DB-*/PG-*/ORA-* 미노출.
  - Linux 자산(예: 기존 nginx 서버) → os-unix/web-nginx 그대로(회귀 없음).
- [ ] **Step 3: 미지원 아님 확인** — Windows 벤더는 VENDOR-NA 아님. (알 수 없는 벤더 예: DB/Foobar는 여전히 VENDOR-NA.)
- [ ] **Step 4: 카탈로그/필터(실물)** — `/catalog`에서 windows 섹션 + MSSQL/WLS/WSP가 CIS로 노출, 컴플라이언스 필터(CIS) 동작. (dev 서버 SSR 확인 또는 getCatalog 단위 확인.)
- [ ] **Step 5: 최종 게이트** — tsc·eslint·vitest 그린. WinRM 실제점검은 "호스트 확보 시"로 원장 기록.

---

## Self-Review (완료)

- **스펙 커버리지:** windows category+WIN(T1), MSSQL/WLS/WSP(T2), os-windows+라우팅(T3, 엔진 핵심), 앱 팩 4종(T4), WinRM 스캐폴드(T5), 검증(T6). IIS는 WEB 재사용.
- **회귀 방지:** resolveCheckPlan 라우팅은 OS 분기와 windows-벤더팩 분기만 추가 — Linux(server→os-unix, repo→container, WEB/Nginx, DB/MySQL 등)는 그대로. T3 Step 5에서 기존 resolve 테스트 유지 확인.
- **타입 일관성:** `Category`에 "windows", `osWindowsPack`/`webIisPack`/`dbMssqlPack`/`wasWeblogicPack`/`wasWebspherePack`(모두 windows·review-pending), `resolveCheckPlan` 라우팅, `runWinrmChecks` 스텁.
- **주의:** 모든 windows 팩은 evaluatePack이 review로 단락(#0)하므로 evaluate/detect/evidenceTasks 미사용. 카탈로그가 UI에 노출되려면 `/catalog` page·FilterPanel의 CATEGORIES 배열과 getCatalogSummary.byCategory에 "windows" 추가 필요(T1에 포함). 실제 WinRM 점검은 보류(스캐폴드).
