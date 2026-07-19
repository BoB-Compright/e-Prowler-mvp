# 벤더 사전 점검 입력값 프레임워크 + 티베로 파일기반 슬라이스 (플랜 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 벤더 팩이 필요한 사전 입력값을 선언하면 자산 등록 폼이 동적 수집→시크릿 암호화 저장→스캔이 extra-vars로 전달하는 프레임워크를 만들고, 티베로 벤더의 파일기반 점검 2종(TB-13/TB-14)으로 전체 파이프라인을 증명한다.

**Architecture:** `VendorPack.requiredInputs`(선언) 하나를 폼·저장·스캔·카탈로그가 공유한다. 자산의 `scan_inputs`(JSON, secret은 AES-256-GCM)에 저장하고, 서버 스캔이 이를 ansible extra-vars로 병합해(secret은 기존 임시파일 채널) evidence raw 명령이 `{{ 변수 }}`로 참조한다. 티베로 팩은 입력값 `{tibero_home}/config/{tibero_tbsid}.tip`를 조합해 SSH로 읽는다.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict / better-sqlite3 / Vitest / ansible-playbook(raw 모듈).

## Global Constraints

- 이 플랜은 티베로 **DB 로그인 쿼리 점검(TB-01~12)은 범위 밖**(플랜 2). TB-13(리스너 IP 제어)·TB-14(설정파일 권한)만 구현.
- secret 입력값은 `@/lib/crypto/secretCipher`의 `encryptSecret`/`decryptSecret`(AES-256-GCM)로 암/복호화. API 응답·로그·AI 입력·ansible CLI 인자에 secret 평문 노출 금지(extra-vars 임시파일 채널만).
- 기존 팩(`requiredInputs` 미선언)은 동작 불변(하위호환).
- 신규 카탈로그 프레임워크 id `tmax`, 이름 `국산 벤더 하드닝 (Tmax)`. 항목 ID 접두 TB(티베로). 카탈로그 category는 `db`.
- 벤더 입력 변수명(=extra-vars 키): `tibero_home`, `tibero_tbsid`, `tibero_db_user`, `tibero_db_pass`(secret), `tibero_listener_port`(선택).
- DB 마이그레이션은 기존 멱등 패턴(`PRAGMA table_info` 가드 + `ALTER TABLE`)을 따른다.
- 실제 코드로 테스트(모의 최소화). 각 태스크는 독립 검증 가능한 산출물로 끝낸다.

---

### Task 1: 타입 확장 — `requiredInputs` / `inputsProvided`

**Files:**
- Modify: `src/lib/packs/types.ts`

**Interfaces:**
- Produces: `ScanInputKind`, `ScanInputSpec`, `VendorPack.requiredInputs?`, `EvalContext.inputsProvided`.

- [ ] **Step 1: 타입 추가**

`src/lib/packs/types.ts`에 추가(파일 상단 import 아래, `VendorPack` 위):

```typescript
// 벤더 점검에 필요한 사전 입력값 스펙. 팩이 선언하면 등록 폼·저장·스캔이 이 선언 하나로 동작한다.
export type ScanInputKind = "text" | "path" | "secret";
export interface ScanInputSpec {
  name: string; // ansible 변수명 = extra-vars 키 (예: "tibero_db_pass")
  label: string; // 폼 라벨
  kind: ScanInputKind; // secret이면 암호화 저장 + password 입력
  required: boolean;
  help?: string;
  placeholder?: string;
}
```

`VendorPack` 인터페이스에 필드 추가:

```typescript
  // 이 팩이 점검 전 필요로 하는 사전 입력값. 미선언이면 입력 불필요(하위호환).
  requiredInputs?: ScanInputSpec[];
```

`EvalContext` 인터페이스에 필드 추가:

```typescript
  // 값이 실제로 제공된 입력값의 name 집합. evaluate가 필수 입력 누락을 review로 처리하는 데 쓴다.
  inputsProvided?: Set<string>;
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과(기존 팩은 optional 필드라 영향 없음).

- [ ] **Step 3: 커밋**

```bash
git add src/lib/packs/types.ts
git commit -m "feat: VendorPack.requiredInputs / EvalContext.inputsProvided 타입 추가"
```

---

### Task 2: 입력값 코덱 — `scanInputs.ts`

**Files:**
- Create: `src/lib/assets/scanInputs.ts`
- Test: `src/lib/assets/scanInputs.test.ts`

**Interfaces:**
- Consumes: `ScanInputSpec`(Task 1), `encryptSecret`/`decryptSecret` from `@/lib/crypto/secretCipher`.
- Produces:
  - `encodeScanInputs(specs: ScanInputSpec[], raw: Record<string,string>): string` — secret kind만 암호화, JSON 문자열.
  - `decodeScanInputs(specs: ScanInputSpec[], stored: string | null): Record<string,string>` — 저장값 파싱, secret 복호화.
  - `providedInputNames(specs: ScanInputSpec[], values: Record<string,string>): Set<string>` — 비어있지 않은 값의 name 집합.

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/assets/scanInputs.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ScanInputSpec } from "@/lib/packs/types";
import { encodeScanInputs, decodeScanInputs, providedInputNames } from "./scanInputs";

const specs: ScanInputSpec[] = [
  { name: "tibero_home", label: "설치 경로", kind: "path", required: true },
  { name: "tibero_db_pass", label: "비밀번호", kind: "secret", required: true },
];

describe("scanInputs codec", () => {
  it("stores non-secret plaintext and encrypts secret (roundtrip)", () => {
    const stored = encodeScanInputs(specs, { tibero_home: "/opt/tb", tibero_db_pass: "s3cret" });
    const parsed = JSON.parse(stored) as Record<string, string>;
    expect(parsed.tibero_home).toBe("/opt/tb"); // 평문
    expect(parsed.tibero_db_pass).not.toBe("s3cret"); // 암호문
    const decoded = decodeScanInputs(specs, stored);
    expect(decoded).toEqual({ tibero_home: "/opt/tb", tibero_db_pass: "s3cret" });
  });

  it("omits empty values", () => {
    const stored = encodeScanInputs(specs, { tibero_home: "  ", tibero_db_pass: "" });
    expect(JSON.parse(stored)).toEqual({});
    expect(decodeScanInputs(specs, stored)).toEqual({});
  });

  it("decodes null/blank stored as empty", () => {
    expect(decodeScanInputs(specs, null)).toEqual({});
    expect(decodeScanInputs(specs, "")).toEqual({});
  });

  it("providedInputNames returns names with non-empty values", () => {
    const names = providedInputNames(specs, { tibero_home: "/opt/tb", tibero_db_pass: "" });
    expect([...names]).toEqual(["tibero_home"]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/assets/scanInputs.test.ts`
Expected: FAIL — `Cannot find module './scanInputs'`.

- [ ] **Step 3: 구현**

Create `src/lib/assets/scanInputs.ts`:

```typescript
import type { ScanInputSpec } from "@/lib/packs/types";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretCipher";

// 자산의 사전 입력값을 JSON으로 인코딩한다. secret kind 값만 AES-256-GCM으로 암호화하고,
// 비어있는 값은 저장하지 않는다(누락=미제공). 반환값이 assets.scan_inputs에 그대로 저장된다.
export function encodeScanInputs(specs: ScanInputSpec[], raw: Record<string, string>): string {
  const secretNames = new Set(specs.filter((s) => s.kind === "secret").map((s) => s.name));
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const value = (raw[spec.name] ?? "").trim();
    if (!value) continue;
    out[spec.name] = secretNames.has(spec.name) ? encryptSecret(value) : value;
  }
  return JSON.stringify(out);
}

// 저장된 JSON을 파싱하고 secret을 복호화해 평문 맵으로 돌려준다(스캔 전달·폼 프리필용).
export function decodeScanInputs(specs: ScanInputSpec[], stored: string | null): Record<string, string> {
  if (!stored || !stored.trim()) return {};
  const secretNames = new Set(specs.filter((s) => s.kind === "secret").map((s) => s.name));
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(stored) as Record<string, string>;
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value) continue;
    out[name] = secretNames.has(name) ? decryptSecret(value) : value;
  }
  return out;
}

export function providedInputNames(specs: ScanInputSpec[], values: Record<string, string>): Set<string> {
  return new Set(specs.filter((s) => (values[s.name] ?? "").trim()).map((s) => s.name));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/assets/scanInputs.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/assets/scanInputs.ts src/lib/assets/scanInputs.test.ts
git commit -m "feat: 자산 사전 입력값 코덱(scanInputs) — secret 암호화 저장/복호화"
```

---

### Task 3: DB 컬럼 + Asset 필드 + store

**Files:**
- Modify: `src/lib/db/index.ts` (마이그레이션)
- Modify: `src/lib/assets/types.ts` (Asset.scanInputs)
- Modify: `src/lib/assets/store.ts` (INSERT/SELECT에 scan_inputs)

**Interfaces:**
- Produces: `Asset.scanInputs: string | null` (저장 원본 JSON). `createServerAsset` 입력에 `scanInputs?: string`(이미 인코딩된 JSON) 수용.

- [ ] **Step 1: 마이그레이션 추가**

`src/lib/db/index.ts`의 assets 컬럼 가드 블록(`const assetColumns = db.prepare(\`PRAGMA table_info(assets)\`)...` 근처)에, 기존 컬럼 추가와 같은 패턴으로 한 줄 추가:

```typescript
  if (!assetColumns.some((c) => c.name === "scan_inputs")) {
    db.exec(`ALTER TABLE assets ADD COLUMN scan_inputs TEXT`);
  }
```

(base 스키마의 `CREATE TABLE assets`에도 `scan_inputs TEXT` 컬럼을 추가해 신규 DB에서도 존재하게 한다 — 기존 컬럼 나열 끝에 `, scan_inputs TEXT` 삽입.)

- [ ] **Step 2: Asset 타입에 필드 추가**

`src/lib/assets/types.ts`의 `Asset` 인터페이스 `dockerfilePath` 아래에 추가:

```typescript
  scanInputs: string | null; // 벤더 사전 입력값 저장 원본(JSON, secret은 암호화됨). 미설정 시 null.
```

- [ ] **Step 3: store 반영**

`src/lib/assets/store.ts`:
- `INSERT_SQL`의 컬럼 목록 끝에 `scan_inputs` 추가, VALUES 플레이스홀더도 하나 추가.
- `createServerAsset`의 입력 타입에 `scanInputs?: string` 추가, INSERT 실행 파라미터에 `scan_inputs: input.scanInputs ?? null` 추가.
- 자산 row → `Asset` 매핑 함수(예: `rowToAsset`)에 `scanInputs: row.scan_inputs ?? null` 추가. (repo 자산 생성 경로는 `scan_inputs`를 null로 넣는다.)

정확한 편집은 파일의 기존 컬럼 나열/매핑 패턴을 그대로 따른다(다른 nullable 컬럼 `os`/`owner`와 동일하게).

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npx vitest run src/lib/assets`
Expected: 타입 클린, 기존 자산 테스트 통과(신규 컬럼은 nullable이라 회귀 없음). 기존 테스트가 row 매핑을 검증한다면 scanInputs=null이 포함되도록 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/index.ts src/lib/assets/types.ts src/lib/assets/store.ts
git commit -m "feat: assets.scan_inputs 컬럼·Asset.scanInputs 필드·store 반영"
```

---

### Task 4: 벤더 입력 스펙 조회 — `getVendorInputSpecs`

**Files:**
- Modify: `src/lib/packs/registry.ts`
- Test: `src/lib/packs/registry.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `findVendorPack(category, vendor)`(기존), `ScanInputSpec`(Task 1).
- Produces: `getVendorInputSpecs(category: string, vendor: string): ScanInputSpec[]` — 매칭 팩의 `requiredInputs ?? []`. 매칭 없으면 `[]`.

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/packs/registry.test.ts`에 추가(기존 import 활용, `getVendorInputSpecs` import 추가):

```typescript
import { getVendorInputSpecs } from "./registry";

describe("getVendorInputSpecs", () => {
  it("returns [] for a vendor without a pack or without requiredInputs", () => {
    expect(getVendorInputSpecs("DB", "존재하지않는벤더")).toEqual([]);
  });
});
```

(티베로 팩 등록 후 실제 스펙 반환은 Task 8 통합에서 확인. 여기서는 함수 존재와 빈 케이스만.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/packs/registry.test.ts`
Expected: FAIL — `getVendorInputSpecs is not a function`.

- [ ] **Step 3: 구현**

`src/lib/packs/registry.ts`에 추가(파일 끝):

```typescript
import type { ScanInputSpec } from "./types";

// 특정 category+vendor 팩이 선언한 사전 입력값 스펙. 폼·저장·스캔이 이 하나를 공유한다.
export function getVendorInputSpecs(category: string, vendor: string): ScanInputSpec[] {
  return findVendorPack(category, vendor)?.requiredInputs ?? [];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/packs/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/packs/registry.ts src/lib/packs/registry.test.ts
git commit -m "feat: getVendorInputSpecs — 벤더 팩의 사전 입력값 스펙 조회"
```

---

### Task 5: 스캔 전달 — extra-vars 병합 + inputsProvided

**Files:**
- Modify: `src/lib/checks/ansibleRunner.ts` (`runAnsibleForServer`에 extraVars 병합)
- Modify: `src/lib/pipeline/serverScan.ts` (inputs 해석·전달, EvalContext.inputsProvided)
- Test: `src/lib/checks/scanInputsExtraVars.test.ts` (병합 순수 로직)

**Interfaces:**
- Consumes: `decodeScanInputs`/`providedInputNames`(Task 2), `getVendorInputSpecs`(Task 4), `EvalContext.inputsProvided`(Task 1).
- Produces: `buildScanExtraVars(asset): Record<string,string>` (자산의 벤더 입력값을 복호화한 extra-vars 맵) + serverScan이 이를 runAnsibleForServer/evaluate에 전달.

- [ ] **Step 1: 실패 테스트 작성 (병합 순수 로직)**

Create `src/lib/checks/scanInputsExtraVars.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/assets/types";
import { buildScanExtraVars } from "./scanInputsExtraVars";

function serverAsset(over: Partial<Asset>): Asset {
  return {
    id: "a1", type: "server", projectId: null, displayName: "db1", repoUrl: null,
    hostIp: "10.0.0.1", hostname: "db1", sshPort: 22, authType: "password", username: "root",
    encryptedSecret: null, os: null, owner: null, category: "DB", vendor: "Tibero",
    dockerfilePath: null, scanInputs: null, createdAt: "2026-07-19T00:00:00Z", ...over,
  };
}

describe("buildScanExtraVars", () => {
  it("returns {} when the asset has no scan inputs", () => {
    expect(buildScanExtraVars(serverAsset({}))).toEqual({});
  });

  it("returns {} for a vendor without a pack", () => {
    expect(buildScanExtraVars(serverAsset({ vendor: "없는벤더", scanInputs: '{"x":"y"}' }))).toEqual({});
  });
  // 티베로 팩 등록 후 실제 복호화 병합은 Task 8 통합에서 검증.
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/checks/scanInputsExtraVars.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현 (병합 헬퍼)**

Create `src/lib/checks/scanInputsExtraVars.ts`:

```typescript
import type { Asset } from "@/lib/assets/types";
import { getVendorInputSpecs } from "@/lib/packs/registry";
import { decodeScanInputs } from "@/lib/assets/scanInputs";

// 서버 자산의 벤더 사전 입력값을 복호화해 ansible extra-vars 맵으로 만든다.
// 벤더 팩이 없거나 입력이 없으면 {}. secret은 여기서 평문이 되지만, 상위(runAnsibleForServer)가
// 임시파일 채널로만 전달하므로 CLI·로그에 노출되지 않는다.
export function buildScanExtraVars(asset: Asset): Record<string, string> {
  if (asset.type !== "server" || !asset.category || !asset.vendor) return {};
  const specs = getVendorInputSpecs(asset.category, asset.vendor);
  if (specs.length === 0) return {};
  return decodeScanInputs(specs, asset.scanInputs);
}
```

- [ ] **Step 4: `runAnsibleForServer`에 extra-vars 병합**

`src/lib/checks/ansibleRunner.ts`의 `runAnsibleForServer` 시그니처에 선택 인자 추가하고, `runAnsibleWithArgs` 호출 시 기존 `plan.extraVars`에 병합한다:

```typescript
export async function runAnsibleForServer(
  asset: Asset,
  extraTasks: PlaybookTask[] = [],
  timeoutMs: number = SERVER_TIMEOUT_MS,
  scanExtraVars: Record<string, string> = {},
): Promise<AnsibleTaskOutput[]> {
```

`runAnsibleWithArgs(plan.args, plan.extraVars, timeoutMs, playbookPath)` 두 곳(있다면)을 아래로 교체:

```typescript
      return runAnsibleWithArgs(plan.args, { ...plan.extraVars, ...scanExtraVars }, timeoutMs, playbookPath);
```

(scanExtraVars가 ssh 접속 변수를 덮지 않도록 이름 접두 `tibero_*`로 충돌 없음. `plan.extraVars` 뒤에 spread.)

- [ ] **Step 5: serverScan에서 전달 + inputsProvided**

`src/lib/pipeline/serverScan.ts`:
- 상단 import: `import { buildScanExtraVars } from "@/lib/checks/scanInputsExtraVars";` 및 `import { providedInputNames } from "@/lib/assets/scanInputs";`, `import { getVendorInputSpecs } from "@/lib/packs/registry";`
- `runAnsibleForServer(asset, plan.evidenceTasks)` 호출을 `runAnsibleForServer(asset, plan.evidenceTasks, undefined, buildScanExtraVars(asset))`로 변경(timeoutMs 기본 유지 위해 `undefined` 전달; 시그니처상 4번째 인자).
- evaluate 호출 시 `EvalContext`에 `inputsProvided`를 넣는다. 자산의 제공된 입력명 집합을 계산:
  ```typescript
  const specs = asset.category && asset.vendor ? getVendorInputSpecs(asset.category, asset.vendor) : [];
  const inputsProvided = providedInputNames(specs, buildScanExtraVars(asset));
  ```
  이 `inputsProvided`를 `evaluatePlan`(또는 각 pack.evaluate에 넘기는 EvalContext) 경로에 전달한다. `evaluatePlan`/`filterPlanByCategories` 흐름에서 EvalContext를 구성하는 지점에 `inputsProvided`를 추가한다(기존 `{ findings, tasks }` 구성에 `inputsProvided` 병합).

정확한 삽입 위치는 serverScan이 `evaluatePlan`/pack.evaluate를 호출하며 EvalContext를 만드는 지점을 따른다.

- [ ] **Step 6: 검증**

Run: `npx vitest run src/lib/checks/scanInputsExtraVars.test.ts && npx vitest run && npx tsc --noEmit && npx eslint src/lib/checks/ansibleRunner.ts src/lib/checks/scanInputsExtraVars.ts src/lib/pipeline/serverScan.ts`
Expected: 신규 테스트 PASS, 전체 회귀 없음, 타입·린트 클린.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/checks/scanInputsExtraVars.ts src/lib/checks/scanInputsExtraVars.test.ts src/lib/checks/ansibleRunner.ts src/lib/pipeline/serverScan.ts
git commit -m "feat: 서버 스캔에 벤더 사전 입력값을 extra-vars로 전달 + inputsProvided"
```

---

### Task 6: 등록 폼 동적 필드 + API 저장 + 자산 상세 수정

**Files:**
- Modify: `src/app/assets/new/AssetForm.tsx` (동적 입력 필드)
- Modify: `src/app/api/assets/route.ts` (POST에서 scanInputs 수용·인코딩)
- Modify: `src/app/assets/[id]/...` (자산 상세 입력값 수정 — 기존 편집 경로가 있으면 확장, 없으면 상세 폼에 섹션 추가)

**Interfaces:**
- Consumes: `getVendorInputSpecs`(Task 4), `encodeScanInputs`(Task 2).

- [ ] **Step 1: AssetForm 동적 필드**

`src/app/assets/new/AssetForm.tsx`:
- import: `import { getVendorInputSpecs } from "@/lib/packs/registry";`
- 벤더 입력값 상태: `const [scanInputValues, setScanInputValues] = useState<Record<string,string>>({});`
- 파생: `const inputSpecs = category && vendor ? getVendorInputSpecs(category, vendor) : [];`
- 서버 자산 폼(category·vendor 선택 아래)에 `inputSpecs`를 순회해 필드 렌더:
  ```tsx
  {inputSpecs.map((spec) => (
    <label key={spec.name} className="flex flex-col gap-1">
      <span className="text-[13px] font-medium">{spec.label}{spec.required && " *"}</span>
      <input
        type={spec.kind === "secret" ? "password" : "text"}
        value={scanInputValues[spec.name] ?? ""}
        placeholder={spec.placeholder}
        onChange={(e) => setScanInputValues((v) => ({ ...v, [spec.name]: e.target.value }))}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {spec.help && <span className="text-[12px] text-muted">{spec.help}</span>}
    </label>
  ))}
  ```
- 서버 자산 등록 제출 body에 `scanInputs: scanInputValues` 포함(원시 평문 맵 — 서버가 인코딩).

- [ ] **Step 2: API 저장**

`src/app/api/assets/route.ts`의 서버 자산 생성 분기에서:
- import: `import { getVendorInputSpecs } from "@/lib/packs/registry"; import { encodeScanInputs } from "@/lib/assets/scanInputs";`
- body의 `scanInputs`(Record<string,string>)와 category·vendor로 스펙을 구해 인코딩:
  ```typescript
  const rawInputs = (body?.scanInputs && typeof body.scanInputs === "object") ? body.scanInputs as Record<string,string> : {};
  const specs = category && vendor ? getVendorInputSpecs(category, vendor) : [];
  const scanInputs = specs.length ? encodeScanInputs(specs, rawInputs) : undefined;
  ```
- `createServerAsset({ ..., scanInputs }, db)`로 전달.

- [ ] **Step 3: 자산 상세 수정 (secret 프리필 정책)**

자산 상세에서 입력값 수정 UI를 제공한다. secret은 평문을 내려보내지 않고 "설정됨(변경하려면 입력)" placeholder로 표시, 빈 값 저장 시 기존 secret 유지. (구현: 상세의 편집 API/폼이 이미 있으면 그 패턴을 따르고, 없으면 최소한 등록 시 수집만으로 SP1 인수 기준을 충족하되 상세 수정은 후속으로 둘 수 있음 — 이 경우 커밋 메시지·리포트에 "상세 수정 후속" 명시.)

주의: 이 스텝은 기존 자산 상세/편집 경로 유무에 따라 범위가 달라진다. 편집 경로가 없으면 SP1에서는 **등록 시 수집**까지 구현하고 상세 수정은 스킵(리포트에 명시)한다. 편집 경로가 있으면 secret 프리필 정책대로 확장한다.

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npx eslint "src/app/assets/new/AssetForm.tsx" "src/app/api/assets/route.ts" && npx vitest run && npm run build`
Expected: 타입·린트 클린, 전체 테스트 통과, 빌드 성공. (티베로 벤더가 아직 없으면 inputSpecs는 항상 []이라 폼 변화 없음 — Task 8 후 실제 필드가 나타난다.)

- [ ] **Step 5: 커밋**

```bash
git add "src/app/assets/new/AssetForm.tsx" "src/app/api/assets/route.ts"
git commit -m "feat: 자산 등록 폼 동적 벤더 입력 필드 + API scanInputs 인코딩 저장"
```

---

### Task 7: 카탈로그 — Tmax 프레임워크 + 티베로 데이터(TB-13/14) + 벤더 등록

**Files:**
- Modify: `src/lib/catalog/frameworks.ts`
- Create: `src/lib/catalog/data/tmax/tibero.json`
- Modify: `src/lib/catalog/index.ts` (로더 등록)
- Modify: `src/lib/assets/categories.ts` (DB 벤더에 Tibero)

**Interfaces:**
- Produces: 카탈로그에 TB-13/TB-14 항목(framework `tmax`, category `db`), CATEGORY_VENDORS.DB에 "Tibero".

- [ ] **Step 1: 프레임워크 등록**

`src/lib/catalog/frameworks.ts`의 `FRAMEWORKS` 배열에 추가:

```typescript
  { id: "tmax", name: "국산 벤더 하드닝 (Tmax)" },
```

- [ ] **Step 2: 티베로 카탈로그 데이터(파일기반 2종)**

Create `src/lib/catalog/data/tmax/tibero.json`:

```json
[
  { "id": "TB-13", "category": "db", "frameworkId": "tmax", "title": "리스너 원격 접근제어(IP 제한) 설정", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 네트워크 접근제어" } },
  { "id": "TB-14", "category": "db", "frameworkId": "tmax", "title": "설정파일(.tip) 소유자·권한 관리", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 설정파일 보호" } }
]
```

(주의: 기존 kisa/web.json 항목은 `category`·`frameworkId`가 로더에서 주입되는지 확인 — web.json 예시엔 category/frameworkId가 없다. 즉 로더가 카테고리·프레임워크를 부여한다. tmax도 동일 패턴이면 JSON에서 `category`/`frameworkId`를 빼고 로더 등록에서 부여한다. 로더 방식을 먼저 확인해 kisa와 동일 형식으로 맞춘다.)

- [ ] **Step 3: 로더 등록**

`src/lib/catalog/index.ts` 상단에 `import tiberoData from "./data/tmax/tibero.json";` 추가하고, 다른 카테고리 데이터와 동일한 방식으로 `tmax`/`db` 항목으로 카탈로그에 합류시킨다(기존 `dbData`(CIS) 등록부와 같은 패턴 — category `db`, frameworkId `tmax` 부여). 기존 로더가 각 데이터 파일에 framework/category를 부여하는 함수를 쓰면 tibero도 같은 함수로 등록한다.

- [ ] **Step 4: 벤더 등록**

`src/lib/assets/categories.ts`의 `CATEGORY_VENDORS.DB` 배열에 `"Tibero"` 추가:

```typescript
  DB: ["Oracle", "MySQL", "PostgreSQL", "MSSQL", "MariaDB", "Tibero"],
```

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 타입 클린, 전체 테스트 통과(카탈로그 항목 수 검증 테스트가 있으면 +2 반영 필요 — 있으면 그 기대값을 갱신), 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/catalog/frameworks.ts src/lib/catalog/data/tmax/tibero.json src/lib/catalog/index.ts src/lib/assets/categories.ts
git commit -m "feat: Tmax 카탈로그 프레임워크 + 티베로 TB-13/TB-14 항목 + DB 벤더 Tibero 등록"
```

---

### Task 8: 티베로 팩 — 입력 스펙 + 파일기반 evidence/evaluate

**Files:**
- Create: `src/lib/packs/dbTibero.ts`
- Test: `src/lib/packs/dbTibero.test.ts`
- Modify: `src/lib/packs/registry.ts` (`ALL_PACKS`에 등록)

**Interfaces:**
- Consumes: `VendorPack`/`ScanInputSpec`/`EvalContext`(Task 1), catalog(Task 7).
- Produces: `tiberoPack: VendorPack` (category "DB", vendors ["Tibero"], requiredInputs, evidenceTasks, detect, evaluate).

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/packs/dbTibero.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import { tiberoPack } from "./dbTibero";

function task(name: string, stdout: string): AnsibleTaskOutput {
  return { taskName: name, stdout };
}
const MISSING = "__MISSING__";

describe("tiberoPack", () => {
  it("declares the five required inputs incl. secret password", () => {
    const names = tiberoPack.requiredInputs!.map((s) => s.name);
    expect(names).toEqual(["tibero_home", "tibero_tbsid", "tibero_db_user", "tibero_db_pass", "tibero_listener_port"]);
    expect(tiberoPack.requiredInputs!.find((s) => s.name === "tibero_db_pass")!.kind).toBe("secret");
  });

  it("TB-13 fails when .tip has no IP access control", () => {
    const tasks = [task("TB-13: tibero tip content", "LISTENER_PORT=8629\nMAX_SESSION_COUNT=100\n")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    const tb13 = r.find((x) => x.id === "TB-13")!;
    expect(tb13.status).toBe("fail");
  });

  it("TB-13 passes when LSNR_INVITED_IP is set", () => {
    const tasks = [task("TB-13: tibero tip content", "LSNR_INVITED_IP=192.168.1.0/24\n")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-13")!.status).toBe("pass");
  });

  it("TB-14 fails when .tip perms are group/other-writable", () => {
    const tasks = [task("TB-14: tibero tip perms", "tibero:tibero 666")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-14")!.status).toBe("fail");
  });

  it("TB-14 passes for 600 perms owned by tibero", () => {
    const tasks = [task("TB-14: tibero tip perms", "tibero:tibero 600")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-14")!.status).toBe("pass");
  });

  it("reviews when required path inputs are missing", () => {
    const tasks = [task("TB-13: tibero tip content", MISSING)];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set() });
    expect(r.find((x) => x.id === "TB-13")!.status).toBe("review");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/packs/dbTibero.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 팩 구현**

Create `src/lib/packs/dbTibero.ts`:

```typescript
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { EvalContext, PlaybookTask, ScanInputSpec, VendorPack } from "./types";

const MISSING = "__MISSING__";
// 설정파일 경로는 입력값으로 조합: {tibero_home}/config/{tibero_tbsid}.tip
const TIP = "{{ tibero_home }}/config/{{ tibero_tbsid }}.tip";

const REQUIRED_INPUTS: ScanInputSpec[] = [
  { name: "tibero_home", label: "설치 경로(TB_HOME)", kind: "path", required: true, placeholder: "/home/tibero/tibero7" },
  { name: "tibero_tbsid", label: "인스턴스(TB_SID)", kind: "text", required: true, placeholder: "tibero" },
  { name: "tibero_db_user", label: "DB 계정", kind: "text", required: true, help: "DBA 권한 계정(예: sys)", placeholder: "sys" },
  { name: "tibero_db_pass", label: "DB 비밀번호", kind: "secret", required: true, help: "tbSQL 로그인용(암호화 저장)" },
  { name: "tibero_listener_port", label: "리스너 포트", kind: "text", required: false, placeholder: "8629" },
];

// 파일기반 증거만(플랜 1). DB 로그인 쿼리(TB-01~12)는 플랜 2.
const EVIDENCE: PlaybookTask[] = [
  { name: "TB-13: tibero tip content",
    raw: `sh -c 'f="${TIP}"; if [ -f "$f" ]; then cat "$f"; else echo ${MISSING}; fi; true'` },
  { name: "TB-14: tibero tip perms",
    raw: `sh -c 'f="${TIP}"; if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; else echo ${MISSING}; fi; true'` },
];

function out(tasks: AnsibleTaskOutput[], name: string): string {
  const s = tasks.find((t) => t.taskName === name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// .tip 텍스트에서 리스너 IP 접근제어 설정(LSNR_INVITED_IP/DENIED_IP 또는 파일 지정)이 있는지.
function hasListenerAcl(tip: string): boolean {
  return /^\s*(LSNR_INVITED_IP|LSNR_DENIED_IP|LSNR_INVITED_IP_FILE|LSNR_DENIED_IP_FILE)\s*=/im.test(tip);
}

// "user:group mode"에서 그룹/기타 쓰기 비트가 있으면 과다 권한.
function isOverPermissive(perms: string): boolean {
  const mode = perms.trim().split(/\s+/)[1] ?? "";
  const m = mode.length === 3 ? mode : mode.slice(-3);
  const group = Number(m[1] ?? "0");
  const other = Number(m[2] ?? "0");
  return (group & 2) === 2 || (other & 2) === 2; // 쓰기 비트
}

export const tiberoPack: VendorPack = {
  id: "tibero",
  category: "DB",
  vendors: ["Tibero"],
  executionPath: "linux",
  itemIds: ["TB-13", "TB-14"],
  requiredInputs: REQUIRED_INPUTS,
  evidenceTasks: EVIDENCE,
  detect(tasks: AnsibleTaskOutput[]): boolean {
    // 서버(declared) 모드에서는 벤더 선언으로 이미 선택됐으므로 항상 true.
    return true;
  },
  evaluate(ctx: EvalContext): CheckResult[] {
    const pathProvided = ctx.inputsProvided?.has("tibero_home") && ctx.inputsProvided?.has("tibero_tbsid");
    const tip = out(ctx.tasks, "TB-13: tibero tip content");
    const perms = out(ctx.tasks, "TB-14: tibero tip perms");

    const tb13: CheckResult = !pathProvided
      ? { id: "TB-13", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : !tip
        ? { id: "TB-13", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : hasListenerAcl(tip)
          ? { id: "TB-13", status: "pass", evidence: "리스너 IP 접근제어 설정됨" }
          : { id: "TB-13", status: "fail", evidence: "리스너 IP 접근제어(LSNR_INVITED_IP/DENIED_IP) 미설정" };

    const tb14: CheckResult = !pathProvided
      ? { id: "TB-14", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : !perms
        ? { id: "TB-14", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : isOverPermissive(perms)
          ? { id: "TB-14", status: "fail", evidence: `설정파일 권한 과다: ${perms.trim()}` }
          : { id: "TB-14", status: "pass", evidence: `설정파일 권한 양호: ${perms.trim()}` };

    return [tb13, tb14];
  },
};
```

- [ ] **Step 4: 레지스트리 등록**

`src/lib/packs/registry.ts`: `import { tiberoPack } from "./dbTibero";` 추가하고 `ALL_PACKS` 배열에 `tiberoPack` 추가.

- [ ] **Step 5: 테스트 통과 확인 + 통합**

Run: `npx vitest run src/lib/packs/dbTibero.test.ts && npx vitest run && npx tsc --noEmit && npx eslint src/lib/packs/dbTibero.ts src/lib/packs/registry.ts && npm run build`
Expected: 팩 테스트 PASS, 전체 통과, 타입·린트·빌드 클린. 이제 `getVendorInputSpecs("DB","Tibero")`가 5개 스펙 반환, 등록 폼에 티베로 입력 필드가 나타난다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/packs/dbTibero.ts src/lib/packs/dbTibero.test.ts src/lib/packs/registry.ts
git commit -m "feat: 티베로 팩(파일기반 TB-13/TB-14) + 입력 스펙 5종, 레지스트리 등록"
```

---

### Task 9: 실 검증 (수동) + 통합 확인

코드 검증은 Task 1~8 테스트로 끝났다. 이 태스크는 등록→스캔 전달 파이프라인의 통합 확인이다(실 티베로 인스턴스는 불필요 — 파일기반 경로는 픽스처로 검증됨, 실 DB E2E는 플랜 2 이후 별도).

- [ ] **Step 1:** 앱 기동 후 서버 자산 등록에서 DB→Tibero 선택 시 5개 입력 필드(설치 경로·인스턴스·계정·비밀번호(password)·리스너 포트)가 나타나는지 확인.
- [ ] **Step 2:** 저장 후 DB의 `assets.scan_inputs`에 비‑secret은 평문, `tibero_db_pass`는 암호문으로 저장됐는지 확인(`sqlite3` 또는 조회).
- [ ] **Step 3:** 카탈로그에서 `국산 벤더 하드닝 (Tmax)` 프레임워크와 TB-13/TB-14 항목이 보이는지 확인.
- [ ] **Step 4:** (선택) 로컬 더미 서버에 `.tip` 파일을 두고 점검을 돌려 TB-13/14가 pass/fail로 나오는지 확인.

---

## Self-Review

**Spec coverage (스펙 → 태스크):**
- §1 requiredInputs 선언 → Task 1. ✓
- §2 데이터(scan_inputs, secret 암호화) → Task 2(코덱)·Task 3(저장). ✓
- §3 스캔 extra-vars 전달 + 필수 누락 review + inputsProvided → Task 5·Task 8(evaluate). ✓
- §4 등록 폼 동적 필드 + API → Task 6. (상세 수정은 편집 경로 유무에 따름 — Task 6 Step 3 명시.) ✓
- §5 카탈로그 + Tmax 프레임워크(TB/JE/WT) → Task 7. ✓
- §7 티베로 벤더/입력값/팩(파일기반 TB-13/14) → Task 7·Task 8. (DB-쿼리 TB-01~12는 플랜 2.) ✓
- 테스트(codec, buildScanExtraVars, 팩 evaluate, getVendorInputSpecs) → Task 2·4·5·8. ✓

**Placeholder scan:** Task 3/5/6/7의 일부 편집은 "기존 패턴을 따른다"로 위치를 지정 — 이는 파일별 상이한 기존 매핑/로더 형식에 맞추기 위한 것으로, 각 스텝에 정확한 추가 코드(컬럼명·필드·함수)를 명시했다. TB-01~12·상세 수정·실 DB E2E는 명시적으로 플랜 2/후속으로 범위 밖 표기(플레이스홀더 아님).

**Type consistency:** `ScanInputSpec`/`encodeScanInputs`/`decodeScanInputs`/`providedInputNames`(Task 2), `getVendorInputSpecs`(Task 4), `buildScanExtraVars`(Task 5), `EvalContext.inputsProvided`(Task 1), `tiberoPack`(Task 8) 시그니처가 사용처와 일치. 입력 변수명 `tibero_*` 5종이 팩·폼·스캔에서 동일. 카탈로그 TB-13/TB-14가 데이터(Task 7)·팩 itemIds(Task 8)에서 동일.
