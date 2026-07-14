# 컨테이너 이미지 전면 점검(OS+서비스 자동탐지) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도커 이미지(repo·local_image) 점검 시 컨테이너 하드닝(C-*)뿐 아니라 OS(U-*)와 이미지 안에서 자동 탐지된 서비스 벤더 팩(nginx/apache/tomcat/mysql/postgres)까지 함께 적용한다.

**Architecture:** `CheckPlan.mode`("declared"|"autodetect") 도입. 비-server 자산은 autodetect 모드로 container+osUnix+5개 벤더 팩을 넣고, evaluate가 각 팩의 detect로 판정해 탐지된 것만 평가·미탐지는 skip. U-*는 OS 감지 시에만. 서버(declared)는 기존과 동일. 증거 수집 배관(runAllChecks→plan.evidenceTasks)은 그대로.

**Tech Stack:** TypeScript, better-sqlite3, vitest.

## Global Constraints

- 테스트/타입/린트는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- 미탐지 벤더 팩(autodetect) → **skip**(status "skip"), review 아님. 서버(declared)의 "미확인→review"는 불변.
- U-*(osUnixPack)는 autodetect에서 **OS 감지 시에만** 평가. declared(서버)에선 항상 평가(불변).
- 자동탐지 벤더 = webNginxPack·webApachePack·wasTomcatPack·dbMysqlPack·dbPostgresPack. windows/oracle 팩 제외.
- 서버 경로·serverScan windowsOnly·기존 declared 동작 회귀 없음.

---

### Task 1: osUnixPack OS 감지 (evidence + detect)

**Files:**
- Modify: `src/lib/packs/osUnix.ts`
- Test: `src/lib/packs/osUnix.test.ts` (없으면 생성)

**Interfaces:**
- Produces: `osUnixPack.evidenceTasks`에 `os detection (internal)` 태스크 추가, `osUnixPack.detect(tasks)`가
  그 태스크 stdout 비어있지 않으면 true.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/packs/osUnix.test.ts` (기존 있으면 describe 추가):

```typescript
import { describe, expect, it } from "vitest";
import { osUnixPack } from "./osUnix";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";

function tasks(osOut: string | null): AnsibleTaskOutput[] {
  return osOut === null ? [] : [{ taskName: "os detection (internal)", stdout: osOut }];
}

describe("osUnixPack.detect (OS 감지)", () => {
  it("os-release/uname 출력이 있으면 true", () => {
    expect(osUnixPack.detect(tasks('NAME="Ubuntu"\nVERSION="24.04"'))).toBe(true);
    expect(osUnixPack.detect(tasks("Linux"))).toBe(true);
  });
  it("태스크가 없거나 비어있으면 false (distroless/scratch)", () => {
    expect(osUnixPack.detect(tasks(null))).toBe(false);
    expect(osUnixPack.detect(tasks("   "))).toBe(false);
  });
  it("os detection 증거 태스크를 evidenceTasks에 포함한다", () => {
    expect(osUnixPack.evidenceTasks.some((t) => t.name === "os detection (internal)")).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs/osUnix.test.ts`
Expected: FAIL — evidenceTasks 비어있음, detect가 항상 true.

- [ ] **Step 3: 구현**

`src/lib/packs/osUnix.ts`:
- import 추가: `import { findTaskOutput } from "@/lib/checks/ansibleRunner";`
- `evidenceTasks: []`를 아래로:

```typescript
  evidenceTasks: [
    {
      name: "os detection (internal)",
      raw: `sh -c 'cat /etc/os-release 2>/dev/null || uname -s 2>/dev/null || true'`,
    },
  ],
```

- `detect: () => true,`를 아래로:

```typescript
  // 리눅스 userland(OS) 존재 여부. os-release나 uname 출력이 있으면 OS로 본다.
  // declared 모드(서버)에선 이 detect가 평가에 쓰이지 않아 U-* 항상 평가는 불변이고,
  // autodetect 모드(이미지)에서만 U-* 적용 여부를 가른다(distroless 배려).
  detect: (tasks) => (findTaskOutput(tasks, "os detection (internal)")?.stdout.trim().length ?? 0) > 0,
```

- [ ] **Step 4: 통과 확인 + 타입/린트 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs/osUnix.test.ts && npx tsc --noEmit && npx eslint src/lib/packs/osUnix.ts src/lib/packs/osUnix.test.ts`
Expected: PASS, 에러 없음.

```bash
git add src/lib/packs/osUnix.ts src/lib/packs/osUnix.test.ts
git commit -m "feat: osUnixPack OS 감지(os-release/uname evidence + detect) — 이미지 U-* 게이팅용"
```

---

### Task 2: CheckPlan.mode + autodetect resolve/evaluate

**Files:**
- Modify: `src/lib/packs/types.ts` (CheckPlan.mode)
- Modify: `src/lib/packs/resolve.ts` (autodetect 분기 + evaluate mode-aware)
- Test: `src/lib/packs/resolve.test.ts` (케이스 추가; 파일 없으면 생성)

**Interfaces:**
- Consumes: `webNginxPack`/`webApachePack`/`wasTomcatPack`/`dbMysqlPack`/`dbPostgresPack`(각 팩 파일), Task 1의 osUnix.detect.
- Produces: `CheckPlan.mode?: "declared" | "autodetect"`; resolveCheckPlan 비-server → autodetect; evaluatePack/Plan mode 인지.

- [ ] **Step 1: 타입에 mode 추가**

`src/lib/packs/types.ts`의 `CheckPlan`:

```typescript
export interface CheckPlan {
  packs: VendorPack[];
  evidenceTasks: PlaybookTask[];
  // "declared"(서버: 선언 벤더, 미확인→review) | "autodetect"(이미지: 자동 탐지, 미탐지→skip).
  // 생략 시 "declared"(하위호환).
  mode?: "declared" | "autodetect";
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

**먼저 기존 테스트 갱신(중요):** `src/lib/packs/resolve.test.ts`에 이미 있는
`it("repo asset → container baseline", ...)` (약 52행)은 `["container"]`를 단언하는데, 이번 변경으로
repo는 autodetect 오토셋을 받으므로 **깨진다**. 이 케이스를 아래 신규 autodetect 기대로 **교체**한다
(container-only 단언 제거). 서버 벤더 케이스(os-unix + 선언 벤더)들은 그대로 통과해야 한다(회귀 확인).

그런 다음 (import: `resolveCheckPlan, evaluatePlan` + 필요한 팩·타입) 케이스 추가:

```typescript
import { describe, expect, it } from "vitest";
import { resolveCheckPlan, evaluatePlan } from "./resolve";
import type { Asset } from "@/lib/assets/types";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";

function repoAsset(over: Partial<Asset> = {}): Asset {
  // 최소 필드 — resolveCheckPlan은 type/category/vendor만 본다.
  return { id: "a1", type: "repo", displayName: "img", category: null, vendor: null, ...(over as object) } as Asset;
}
function serverAsset(over: Partial<Asset> = {}): Asset {
  return { id: "s1", type: "server", displayName: "srv", category: null, vendor: null, ...(over as object) } as Asset;
}

describe("resolveCheckPlan — 이미지 autodetect", () => {
  it("비-server는 autodetect 모드 + container·os-unix·5개 벤더 팩", () => {
    const plan = resolveCheckPlan(repoAsset());
    expect(plan.mode).toBe("autodetect");
    const ids = plan.packs.map((p) => p.id).sort();
    expect(ids).toEqual(["container", "db-mysql", "db-postgresql", "os-unix", "was-tomcat", "web-apache", "web-nginx"].sort());
  });
  it("server는 declared 모드(회귀)", () => {
    const plan = resolveCheckPlan(serverAsset());
    expect(plan.mode ?? "declared").toBe("declared");
    expect(plan.packs.map((p) => p.id)).toContain("os-unix");
    expect(plan.packs.map((p) => p.id)).not.toContain("web-nginx"); // 선언 없으면 벤더 팩 없음
  });
});

describe("evaluatePlan — autodetect skip/eval", () => {
  // nginx 탐지 증거 + OS 증거는 있고, postgres 증거는 없음 → nginx 평가·postgres skip·U-* 평가
  function imgTasks(): AnsibleTaskOutput[] {
    return [
      { taskName: "os detection (internal)", stdout: 'NAME="Ubuntu"' },
      // nginx detect가 참이 되도록 최소 증거(실제 팩 detect가 보는 태스크명에 맞춰야 함).
      // 아래는 예시 — 실제 webNginxPack.detect가 참조하는 태스크명/내용으로 맞춘다.
    ];
  }
  it("OS 감지 시 U-*는 skip이 아님, 미탐지 벤더는 skip(review 아님)", () => {
    const plan = resolveCheckPlan(repoAsset());
    const results = evaluatePlan(plan, { findings: null, tasks: imgTasks() }, repoAsset());
    // U-* 최소 1건이 skip이 아니어야(OS 감지됨)
    expect(results.some((r) => r.id.startsWith("U-") && r.status !== "skip")).toBe(true);
    // postgres(PG-*) 미탐지 → 전부 skip, review 없음
    const pg = results.filter((r) => r.id.startsWith("PG-"));
    expect(pg.length).toBeGreaterThan(0);
    expect(pg.every((r) => r.status === "skip")).toBe(true);
    // VENDOR-NA 합성 항목은 autodetect에서 생기지 않음
    expect(results.some((r) => r.id === "VENDOR-NA")).toBe(false);
  });
  it("OS 미감지 시 U-*는 전부 skip", () => {
    const plan = resolveCheckPlan(repoAsset());
    const results = evaluatePlan(plan, { findings: null, tasks: [] }, repoAsset());
    const u = results.filter((r) => r.id.startsWith("U-"));
    expect(u.length).toBeGreaterThan(0);
    expect(u.every((r) => r.status === "skip")).toBe(true);
  });
});
```

주의: `webNginxPack.detect` 등이 참조하는 실제 태스크명/증거 형식을 각 팩 파일에서 확인해 `imgTasks()`를
맞춘다(위 nginx 증거는 자리표시). 최소한 "미탐지 벤더 skip / OS 게이팅 / VENDOR-NA 없음"을 검증하는 게 목표다.

- [ ] **Step 3: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs/resolve.test.ts`
Expected: FAIL — mode 없음/컨테이너가 벤더 팩 미포함/미탐지 review.

- [ ] **Step 4: resolve.ts 구현**

`src/lib/packs/resolve.ts`:
- import 추가:

```typescript
import { webNginxPack } from "./webNginx";
import { webApachePack } from "./webApache";
import { wasTomcatPack } from "./wasTomcat";
import { dbMysqlPack } from "./dbMysql";
import { dbPostgresPack } from "./dbPostgres";
```

- 상단에 오토셋 상수:

```typescript
// 이미지 자동 탐지 대상(테스트 가능한 리눅스 벤더). 각 팩의 detect가 이미지 내부 증거로 자체 판정한다.
const CONTAINER_AUTODETECT_PACKS: VendorPack[] = [
  webNginxPack, webApachePack, wasTomcatPack, dbMysqlPack, dbPostgresPack,
];
```

- `resolveCheckPlan` 시작부에 비-server 분기 추가(기존 server 로직 앞):

```typescript
export function resolveCheckPlan(asset: Asset): CheckPlan {
  // 컨테이너/이미지: OS + 서비스로 전면 점검(자동 탐지). container·os-unix·벤더 오토셋을 모두 넣고,
  // 평가 시 각 팩 detect로 탐지된 것만 평가·미탐지는 skip한다.
  if (asset.type !== "server") {
    const packs: VendorPack[] = [containerPack, osUnixPack, ...CONTAINER_AUTODETECT_PACKS];
    const evidenceTasks = mergeEvidenceTasks(packs.map((p) => p.evidenceTasks));
    return { packs, evidenceTasks, mode: "autodetect" };
  }

  // 서버: 선언 category+vendor 기반(declared) — 기존 로직 유지.
  const packs: VendorPack[] = [];
  const linuxBaseline = osUnixPack;
  ...(기존 server 로직: OS 분기 / 벤더 팩 / windows 베이스라인)...
  const evidenceTasks = mergeEvidenceTasks(packs.map((p) => p.evidenceTasks));
  return { packs, evidenceTasks, mode: "declared" };
}
```

주의: 기존 server 분기에서 `linuxBaseline`은 서버이므로 항상 `osUnixPack`이다(기존엔 `asset.type === "server" ? osUnixPack : containerPack`였는데, 비-server는 위에서 이미 return하므로 server 분기의 baseline은 osUnixPack로 단순화). 기존 OS/벤더/windows 로직·`findVendorPack`·push 순서는 그대로 두고 반환에 `mode: "declared"`만 추가.

- `skipAll` 헬퍼 추가:

```typescript
function skipAll(pack: VendorPack, message: string): CheckResult[] {
  return pack.itemIds.map((id) => ({ id, status: "skip", evidence: message }));
}
```

- `evaluatePack`에 mode 파라미터 추가:

```typescript
export function evaluatePack(
  pack: VendorPack,
  ctx: EvalContext,
  mode: "declared" | "autodetect" = "declared",
): CheckResult[] {
  if (pack.executionPath === "windows") {
    return reviewAll(pack, "Windows 호스트 연결 대기 (자동 점검 미연결)");
  }
  if (mode === "autodetect") {
    // 이미지: 탐지된 것만 평가, 미탐지는 skip(노이즈 억제).
    if (pack.detect(ctx.tasks)) return pack.evaluate(ctx);
    const label = pack.vendors.length > 0 ? pack.vendors.join("/") : "OS(리눅스 userland)";
    return skipAll(pack, `이미지에서 ${label} 미탐지 — 해당 없음`);
  }
  // declared(서버): 선언 벤더 미확인은 review.
  if (pack.vendors.length > 0 && !pack.detect(ctx.tasks)) {
    return reviewAll(pack, `선언된 ${pack.vendors.join("/")} 미확인 — 인벤토리 확인 필요`);
  }
  return pack.evaluate(ctx);
}
```

- `evaluatePlan`에서 mode 전달 + VENDOR-NA를 declared 한정:

```typescript
export function evaluatePlan(plan: CheckPlan, ctx: EvalContext, asset: Asset): CheckResult[] {
  const mode = plan.mode ?? "declared";
  const results = plan.packs.flatMap((pack) => evaluatePack(pack, ctx, mode));
  const hasVendorPack = plan.packs.some((p) => p.vendors.length > 0);
  if (mode === "declared" && asset.category && asset.category !== "OS" && asset.vendor && !hasVendorPack) {
    results.push({
      id: UNSUPPORTED_VENDOR_ID,
      status: "review",
      evidence: `미지원 벤더 (${asset.category}/${asset.vendor}) — 자동 점검 미구현`,
    });
  }
  return results;
}
```

(`CheckResult`가 resolve.ts에 import돼 있는지 확인 — 이미 `import type { CheckResult }` 있음.)

- [ ] **Step 5: 통과 확인 + 전체 회귀 + 타입/린트**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/packs && npx tsc --noEmit && npx eslint src/lib/packs/resolve.ts src/lib/packs/resolve.test.ts src/lib/packs/types.ts`
Expected: 신규 PASS + 기존 packs 테스트(서버 declared·windowsOnly 등) 회귀 없음.

- [ ] **Step 6: 전체 스위트(서버 파이프라인 회귀 확인)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/pipeline src/lib/checks`
Expected: PASS(serverScan·orchestrator·checks 회귀 없음).

- [ ] **Step 7: 커밋**

```bash
git add src/lib/packs/types.ts src/lib/packs/resolve.ts src/lib/packs/resolve.test.ts
git commit -m "feat: 이미지 자동탐지 점검 — CheckPlan.mode + container/os-unix/벤더 오토셋(미탐지 skip, U-* OS게이팅)"
```

---

## 실행 후(병합 전) 컨트롤러 — 실제 흐름 verify + 배포
- 실제 도커 이미지(예: `nginx`, `postgres`)를 repo/local_image 자산으로 점검 실행 →
  결과에 **C-*(컨테이너) + U-*(OS) + 해당 벤더(WEB-*/PG-*)** 항목이 나오고, 이미지에 없는 벤더 항목은
  결과에 없음(skip)임을 확인. distroless 이미지(있으면)로 U-* skip도 확인.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul).
