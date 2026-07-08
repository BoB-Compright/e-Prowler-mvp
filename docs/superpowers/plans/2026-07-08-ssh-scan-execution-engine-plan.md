# A2: SSH 점검 실행 엔진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A1에서 등록된 서버 자산(SSH 자격증명 암호화 저장 완료)을 실제로 SSH/Ansible로 점검하는 실행 엔진을 만든다. 단건 스캔과 프로젝트 단위 일괄 스캔(fleet scan, 최대 5대 동시)을 지원한다.

**Architecture:** 기존 `ansible/security-checks.yml` playbook을 그대로 재사용하고, `ansibleRunner.ts`가 자산 타입에 따라 커넥션 인자만 분기한다(컨테이너=`community.docker.docker`, 서버=`paramiko`/`ssh`). 서버 타입 run은 기존 6단계 대신 `connect → ansible_scan → rule_evaluation → claude_analysis → done` 4단계를 쓴다. fleet scan은 `scan_batches` 테이블과 `runs.batch_id`로 묶는다. 동시성은 in-process 세마포어(로컬 단일 사용자 MVP라 외부 큐 불필요).

**Tech Stack:** A1과 동일 (Next.js 16 / TS / better-sqlite3 / Vitest). 신규 의존성 없음 — SSH는 로컬에 설치된 `ansible-playbook` + `paramiko`를 사용한다. 암호화는 A1 Task 2에서 만든 `secretCipher`를 재사용한다.

## Global Constraints

- A1의 Global Constraints를 모두 승계한다 (db 인자 주입 패턴, 한국어 에러, Vitest co-locate, App Router `Promise` params 등).
- SSH 자격증명(비밀번호·키) 원문은 로그·에러 메시지·Claude payload 어디에도 남기지 않는다. 인증 실패 시 `error_message`는 "인증 실패"로만 기록한다.
- 복호화한 SSH 키를 임시 파일로 쓸 때는 0600 권한으로 생성하고, 실행 성공/실패와 무관하게 `try/finally`로 반드시 삭제한다.
- playbook은 읽기 전용 점검만 수행한다는 기존 원칙을 유지한다. 실서버 대상 실행이 추가되므로, A2 구현 완료 후 `ansible-playbook-reviewer` 서브에이전트로 재검토한다(Task 8).
- 연결 실패(timeout/connection refused)만 재시도하고, 인증 실패는 재시도하지 않는다.

---

### Task 1: DB 스키마 — `scan_batches` 테이블 및 `runs.batch_id` 컬럼

**Files:**
- Modify: `src/lib/db/index.ts`
- Test: `src/lib/db/index.test.ts` (A1에서 만든 파일에 케이스 추가)

**Interfaces:**
- Produces: `scan_batches` 테이블(`id, project_id, created_at`), `runs.batch_id` 컬럼(nullable TEXT)

- [ ] **Step 1: 실패하는 테스트 추가**

A1의 `src/lib/db/index.test.ts`에 케이스 추가:

```ts
it("creates scan_batches table with runs.batch_id column", () => {
  const db = createInMemoryDb();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => (r as { name: string }).name);
  expect(tables).toContain("scan_batches");
  const runColumns = db.prepare(`PRAGMA table_info(runs)`).all().map((r) => (r as { name: string }).name);
  expect(runColumns).toContain("batch_id");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/db/index.test.ts`
Expected: FAIL

- [ ] **Step 3: 스키마 추가**

`SCHEMA` 문자열에 추가:

```ts
CREATE TABLE IF NOT EXISTS scan_batches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  created_at TEXT NOT NULL
);
```

`migrate()`에 추가:

```ts
if (!runColumns.some((column) => column.name === "batch_id")) {
  db.exec(`ALTER TABLE runs ADD COLUMN batch_id TEXT REFERENCES scan_batches(id)`);
}
```

- [ ] **Step 4: 테스트 통과 확인 → 커밋**

```bash
npx vitest run src/lib/db/index.test.ts
git add src/lib/db/index.ts src/lib/db/index.test.ts
git commit -m "feat: scan_batches 테이블과 runs.batch_id 컬럼 추가"
```

---

### Task 2: SSH 커맨드 빌더

**Files:**
- Create: `src/lib/checks/sshCommand.ts`
- Test: `src/lib/checks/sshCommand.test.ts`

**Interfaces:**
- Consumes: `Asset` (`@/lib/assets/types`)
- Produces:
  - `type SshConnectionPlan = { args: string[]; extraVars: Record<string, string>; keyFilePath: string | null }`
  - `buildSshArgs(asset: Asset, decryptedSecret: string, keyFilePath: string | null): SshConnectionPlan` — 비밀번호 인증이면 `ansible_ssh_pass`를 extraVars로, 키 인증이면 `--private-key <keyFilePath>`를 args로. 공통으로 `ansible_user`, `ansible_port`를 넣고 host key 체크는 MVP상 비활성(`ANSIBLE_HOST_KEY_CHECKING=false`는 실행 시 env로 처리하므로 여기선 args만).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/checks/sshCommand.test.ts
import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/assets/types";
import { buildSshArgs } from "./sshCommand";

function serverAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1", type: "server", projectId: null, displayName: "web-01",
    repoUrl: null, hostIp: "10.0.0.5", hostname: "web-01", sshPort: 2222,
    authType: "password", username: "admin", encryptedSecret: "enc", createdAt: "now",
    ...overrides,
  };
}

describe("buildSshArgs", () => {
  it("passes the password via extra-vars, never in args", () => {
    const plan = buildSshArgs(serverAsset({ authType: "password" }), "s3cret", null);
    expect(plan.extraVars.ansible_ssh_pass).toBe("s3cret");
    expect(plan.args.join(" ")).not.toContain("s3cret");
    expect(plan.args.join(" ")).toContain("ansible_user=admin");
    expect(plan.args.join(" ")).toContain("ansible_port=2222");
  });

  it("uses --private-key for key auth and does not set ansible_ssh_pass", () => {
    const plan = buildSshArgs(serverAsset({ authType: "key" }), "-----KEY-----", "/tmp/key-abc");
    expect(plan.args).toContain("--private-key");
    expect(plan.args).toContain("/tmp/key-abc");
    expect(plan.extraVars.ansible_ssh_pass).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/checks/sshCommand.test.ts`
Expected: FAIL

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/checks/sshCommand.ts
import type { Asset } from "@/lib/assets/types";

export interface SshConnectionPlan {
  args: string[];
  extraVars: Record<string, string>;
  keyFilePath: string | null;
}

export function buildSshArgs(
  asset: Asset,
  decryptedSecret: string,
  keyFilePath: string | null,
): SshConnectionPlan {
  const inventory = `${asset.hostIp},`;
  const extraVars: Record<string, string> = {
    ansible_user: asset.username ?? "",
    ansible_port: String(asset.sshPort ?? 22),
  };

  const args = ["-i", inventory];

  if (asset.authType === "key") {
    if (!keyFilePath) throw new Error("키 인증에는 keyFilePath가 필요합니다");
    args.push("-c", "ssh", "--private-key", keyFilePath);
  } else {
    args.push("-c", "paramiko");
    extraVars.ansible_ssh_pass = decryptedSecret;
  }

  // ansible_user / ansible_port를 -e 로 넘긴다 (호스트별 변수)
  args.push("-e", `ansible_user=${extraVars.ansible_user}`);
  args.push("-e", `ansible_port=${extraVars.ansible_port}`);

  return { args, extraVars, keyFilePath };
}
```

> 주의: `ansible_ssh_pass`는 args가 아니라 `extraVars`로만 반환한다. 실제 실행부(Task 4)에서 이 값을 stdin JSON extra-vars(`-e @/dev/stdin` 또는 `--extra-vars` 파일)로 넘겨 프로세스 목록(`ps`)에 노출되지 않게 한다. args에 넣지 않는 이유가 이 테스트의 핵심이다.

- [ ] **Step 4: 테스트 통과 확인 → 커밋**

```bash
npx vitest run src/lib/checks/sshCommand.test.ts
git add src/lib/checks/sshCommand.ts src/lib/checks/sshCommand.test.ts
git commit -m "feat: 자산 타입별 SSH ansible 커맨드 빌더 추가"
```

---

### Task 3: 임시 키 파일 관리 유틸

**Files:**
- Create: `src/lib/checks/tempKeyFile.ts`
- Test: `src/lib/checks/tempKeyFile.test.ts`

**Interfaces:**
- Produces: `withTempKeyFile<T>(keyContent: string, fn: (path: string) => Promise<T>): Promise<T>` — 0600 임시 파일 생성 후 `fn` 실행, 성공/실패 무관하게 finally에서 삭제

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/checks/tempKeyFile.test.ts
import { existsSync, readFileSync, statSync } from "fs";
import { describe, expect, it } from "vitest";
import { withTempKeyFile } from "./tempKeyFile";

describe("withTempKeyFile", () => {
  it("creates a 0600 file with the key content and deletes it after", async () => {
    let capturedPath = "";
    await withTempKeyFile("-----PRIVATE KEY-----", async (path) => {
      capturedPath = path;
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe("-----PRIVATE KEY-----");
      expect(statSync(path).mode & 0o777).toBe(0o600);
    });
    expect(existsSync(capturedPath)).toBe(false);
  });

  it("still deletes the file when fn throws", async () => {
    let capturedPath = "";
    await expect(
      withTempKeyFile("k", async (path) => {
        capturedPath = path;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(capturedPath)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/checks/tempKeyFile.test.ts`
Expected: FAIL

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/checks/tempKeyFile.ts
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";

export async function withTempKeyFile<T>(
  keyContent: string,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "ssh-key-"));
  const keyPath = path.join(dir, `${randomUUID()}.pem`);
  writeFileSync(keyPath, keyContent, { mode: 0o600 });
  try {
    return await fn(keyPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인 → 커밋**

```bash
npx vitest run src/lib/checks/tempKeyFile.test.ts
git add src/lib/checks/tempKeyFile.ts src/lib/checks/tempKeyFile.test.ts
git commit -m "feat: SSH 키 임시파일 생성/삭제 유틸 추가 (0600, finally cleanup)"
```

---

### Task 4: `ansibleRunner`에 SSH 실행 경로 추가

**Files:**
- Modify: `src/lib/checks/ansibleRunner.ts`
- Test: `src/lib/checks/ansibleRunner.test.ts` (있으면 확장, 없으면 신규 — 단, 실제 ssh 실행은 통합 성격이므로 여기서는 "커넥션 선택 분기" 로직만 유닛 테스트한다)

**Interfaces:**
- Consumes: `buildSshArgs` (`./sshCommand`), `withTempKeyFile` (`./tempKeyFile`), `decryptSecret` (`@/lib/crypto/secretCipher`), `Asset` (`@/lib/assets/types`)
- Produces: `runAnsibleForServer(asset: Asset, timeoutMs?: number): Promise<AnsibleResult>` — 기존 컨테이너용 실행 함수와 나란히 존재. 기존 `AnsibleResult` 타입을 재사용한다.

- [ ] **Step 1: 실제 파일 확인**

`src/lib/checks/ansibleRunner.ts`를 Read로 열어 기존 컨테이너용 실행 함수 이름, `AnsibleResult` 타입, JSON 콜백 파싱 방식(`findTaskOutput`), 60초 타임아웃 처리, `spawn`/`execFile` 사용 패턴을 확인한다. 아래 구현은 기존 spawn 패턴과 JSON 콜백 파서를 재사용하는 것을 전제로 한다.

- [ ] **Step 2: 실패하는 테스트 작성** (커넥션 분기 + 키/비번 처리 검증. 실제 프로세스 spawn은 mock)

```ts
// src/lib/checks/ansibleRunner.test.ts (해당 describe 추가)
import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";
import type { Asset } from "@/lib/assets/types";
import { encryptSecret } from "@/lib/crypto/secretCipher";

// buildServerRunPlan은 실제 spawn 없이 asset을 받아 실행 계획(연결/키파일 여부)을 만드는 순수 함수.
// runAnsibleForServer 내부에서 이 함수를 사용하고, 테스트는 이 순수 함수만 검증한다.
import { buildServerRunPlan } from "./ansibleRunner";

function server(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1", type: "server", projectId: null, displayName: "web-01",
    repoUrl: null, hostIp: "10.0.0.5", hostname: "web-01", sshPort: 22,
    authType: "password", username: "admin", encryptedSecret: encryptSecret("pw"), createdAt: "now",
    ...overrides,
  };
}

describe("buildServerRunPlan", () => {
  it("decrypts the secret and marks password auth as needing no key file", () => {
    process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
    const asset = server({ authType: "password", encryptedSecret: encryptSecret("pw") });
    const plan = buildServerRunPlan(asset);
    expect(plan.needsKeyFile).toBe(false);
    expect(plan.decryptedSecret).toBe("pw");
  });

  it("marks key auth as needing a key file", () => {
    process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
    const asset = server({ authType: "key", encryptedSecret: encryptSecret("-----KEY-----") });
    const plan = buildServerRunPlan(asset);
    expect(plan.needsKeyFile).toBe(true);
    expect(plan.decryptedSecret).toBe("-----KEY-----");
  });
});
```

- [ ] **Step 3: 최소 구현**

`ansibleRunner.ts`에 추가한다. 기존 컨테이너용 실행 로직(spawn + JSON 콜백 파서)을 재사용하되, 인자만 `buildSshArgs`가 만든 것으로 바꾼다:

```ts
import { buildSshArgs } from "./sshCommand";
import { withTempKeyFile } from "./tempKeyFile";
import { decryptSecret } from "@/lib/crypto/secretCipher";
import type { Asset } from "@/lib/assets/types";

const SERVER_TIMEOUT_MS = 5 * 60 * 1000; // 서버당 5분 (컨테이너 60초와 별도)

export interface ServerRunPlan {
  decryptedSecret: string;
  needsKeyFile: boolean;
}

export function buildServerRunPlan(asset: Asset): ServerRunPlan {
  const decryptedSecret = decryptSecret(asset.encryptedSecret ?? "");
  return { decryptedSecret, needsKeyFile: asset.authType === "key" };
}

export async function runAnsibleForServer(
  asset: Asset,
  timeoutMs: number = SERVER_TIMEOUT_MS,
): Promise<AnsibleResult> {
  const { decryptedSecret, needsKeyFile } = buildServerRunPlan(asset);

  const run = async (keyFilePath: string | null): Promise<AnsibleResult> => {
    const plan = buildSshArgs(asset, decryptedSecret, keyFilePath);
    // 기존 컨테이너 실행과 동일한 spawn 헬퍼를 호출하되:
    //  - args: [...plan.args, PLAYBOOK_PATH]
    //  - ansible_ssh_pass는 args가 아니라 --extra-vars 파일 또는 stdin JSON으로 전달 (ps 노출 방지)
    //  - env: { ...process.env, ANSIBLE_HOST_KEY_CHECKING: "false" }
    //  - timeout: timeoutMs
    // 반환은 기존 JSON 콜백 파서(findTaskOutput 등)를 그대로 사용해 AnsibleResult로 만든다.
    return runAnsibleWithArgs(plan.args, plan.extraVars, timeoutMs); // ← 기존 spawn 로직을 이 헬퍼로 감싼다
  };

  if (needsKeyFile) {
    return withTempKeyFile(decryptedSecret, (keyFilePath) => run(keyFilePath));
  }
  return run(null);
}
```

> 구현 시 기존 컨테이너용 spawn 코드를 `runAnsibleWithArgs(extraArgs, extraVars, timeoutMs)` 같은 내부 헬퍼로 리팩터링해 두 경로가 공유하게 한다. `extraVars`(특히 `ansible_ssh_pass`)는 임시 JSON 파일에 써서 `--extra-vars @<file>`로 넘기고, 그 파일도 `withTempKeyFile`과 같은 방식으로 실행 후 삭제한다. args 문자열에 비밀번호를 직접 넣지 않는다.

- [ ] **Step 4: 테스트 통과 확인 → 커밋**

```bash
npx vitest run src/lib/checks/ansibleRunner.test.ts
git add src/lib/checks/ansibleRunner.ts src/lib/checks/ansibleRunner.test.ts
git commit -m "feat: ansibleRunner에 서버 SSH 실행 경로 추가 (키/비번 분기)"
```

---

### Task 5: 재시도 로직 (연결 실패만 재시도)

**Files:**
- Create: `src/lib/checks/retry.ts`
- Test: `src/lib/checks/retry.test.ts`

**Interfaces:**
- Produces:
  - `class AuthFailureError extends Error` (재시도 금지 신호)
  - `class ConnectionFailureError extends Error` (재시도 대상)
  - `retryOnConnectionFailure<T>(fn: () => Promise<T>, opts?: { maxAttempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<T>` — `ConnectionFailureError`만 최대 `maxAttempts`(기본 3)회, `delayMs`(기본 30000) 간격 재시도. `AuthFailureError`는 즉시 throw.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/checks/retry.test.ts
import { describe, expect, it, vi } from "vitest";
import { AuthFailureError, ConnectionFailureError, retryOnConnectionFailure } from "./retry";

const noSleep = async () => {};

describe("retryOnConnectionFailure", () => {
  it("retries connection failures up to maxAttempts then throws", async () => {
    const fn = vi.fn().mockRejectedValue(new ConnectionFailureError("timeout"));
    await expect(
      retryOnConnectionFailure(fn, { maxAttempts: 3, sleep: noSleep }),
    ).rejects.toThrow(ConnectionFailureError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry auth failures", async () => {
    const fn = vi.fn().mockRejectedValue(new AuthFailureError("bad password"));
    await expect(
      retryOnConnectionFailure(fn, { maxAttempts: 3, sleep: noSleep }),
    ).rejects.toThrow(AuthFailureError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await retryOnConnectionFailure(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds after a transient connection failure", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ConnectionFailureError("refused"))
      .mockResolvedValue("ok");
    expect(await retryOnConnectionFailure(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/checks/retry.test.ts`
Expected: FAIL

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/checks/retry.ts
export class AuthFailureError extends Error {}
export class ConnectionFailureError extends Error {}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryOnConnectionFailure<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const delayMs = opts.delayMs ?? 30000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof ConnectionFailureError)) throw error; // 인증 실패 등은 즉시 전파
      lastError = error;
      if (attempt < maxAttempts) await sleep(delayMs);
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: 테스트 통과 확인 → 커밋**

```bash
npx vitest run src/lib/checks/retry.test.ts
git add src/lib/checks/retry.ts src/lib/checks/retry.test.ts
git commit -m "feat: 연결 실패만 재시도하는 유틸 추가 (인증 실패는 즉시 실패)"
```

> 구현 참고: Task 4의 `runAnsibleWithArgs`에서 ansible stderr를 파싱해 인증 관련 실패(`Permission denied`, `Invalid/incorrect password`, `UNREACHABLE`+auth)는 `AuthFailureError`로, 연결 관련(`timed out`, `Connection refused`, `No route to host`)은 `ConnectionFailureError`로 매핑한다. 이 매핑 함수도 순수 함수로 빼서 유닛 테스트하면 좋다(선택).

---

### Task 6: 서버 파이프라인 오케스트레이터 + fleet scan

**Files:**
- Create: `src/lib/pipeline/serverScan.ts`
- Create: `src/lib/pipeline/scanBatches.ts` (batch store)
- Test: `src/lib/pipeline/scanBatches.test.ts`
- Test: `src/lib/pipeline/serverScan.test.ts`

**Interfaces:**
- Consumes: `createRun`, `updateRunStage` 등 기존 run 상태 갱신 함수 (`@/lib/pipeline/runs`), `runAnsibleForServer` (`@/lib/checks/ansibleRunner`), `retryOnConnectionFailure` (`@/lib/checks/retry`), `getAsset`, `listAssets` (`@/lib/assets/store`), rule evaluation/claude 저장 (기존 파이프라인 재사용)
- Produces:
  - `createScanBatch(projectId: string, db?): { id: string }`
  - `listRunsByBatch(batchId: string, db?): Run[]`
  - `scanServerAsset(assetId: string, batchId?: string | null): Promise<void>` — 단건. run 생성 → connect → ansible_scan → rule_evaluation → claude_analysis → done 단계 전이.
  - `scanProjectFleet(projectId: string): Promise<{ batchId: string; runIds: string[] }>` — 프로젝트의 server 자산 전체를 최대 5대 동시로 스캔, 모두 동일 batchId

- [ ] **Step 1: batch store 테스트 + 구현**

```ts
// src/lib/pipeline/scanBatches.test.ts
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createProject } from "@/lib/projects/store";
import { createRun } from "@/lib/pipeline/runs";
import { createScanBatch, listRunsByBatch } from "./scanBatches";

let db: Database;
beforeEach(() => { db = createInMemoryDb(); });

describe("scan batches", () => {
  it("groups runs sharing a batch id", () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const batch = createScanBatch(project.id, db);
    const r1 = createRun("10.0.0.1", "server", null, db);
    const r2 = createRun("10.0.0.2", "server", null, db);
    db.prepare(`UPDATE runs SET batch_id = ? WHERE id IN (?, ?)`).run(batch.id, r1.id, r2.id);
    expect(listRunsByBatch(batch.id, db)).toHaveLength(2);
  });
});
```

```ts
// src/lib/pipeline/scanBatches.ts
import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { listRuns, type Run } from "@/lib/pipeline/runs";

export function createScanBatch(projectId: string, db: Database = getDb()): { id: string } {
  const id = randomUUID();
  db.prepare(`INSERT INTO scan_batches (id, project_id, created_at) VALUES (?, ?, ?)`).run(
    id, projectId, new Date().toISOString(),
  );
  return { id };
}

export function listRunsByBatch(batchId: string, db: Database = getDb()): Run[] {
  return listRuns(db).filter((run) => run.batchId === batchId);
}
```

> `listRuns`가 `db` 인자를 받지 않거나 `Run`에 `batchId`가 없으면, Task 1에서 컬럼을 추가했으니 `runs.ts`의 `Run` 타입/`toRun`/`listRuns`에 `batchId: row.batch_id`를 추가한다(A1 Task 8에서 `assetId`를 추가한 것과 동일 방식). 이 보강을 이 Task의 Step 1에 포함한다.

- [ ] **Step 2: 동시성 제한 fleet scan 테스트 + 구현**

동시성은 순수 함수로 분리해 테스트한다:

```ts
// src/lib/pipeline/serverScan.test.ts
import { describe, expect, it, vi } from "vitest";
import { runWithConcurrency } from "./serverScan";

describe("runWithConcurrency", () => {
  it("never runs more than the limit at once", async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 12 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    await runWithConcurrency(tasks, 5);
    expect(maxActive).toBeLessThanOrEqual(5);
  });

  it("runs all tasks", async () => {
    const done: number[] = [];
    const tasks = Array.from({ length: 7 }, (_, i) => async () => { done.push(i); });
    await runWithConcurrency(tasks, 5);
    expect(done.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("isolates a failing task without aborting the rest", async () => {
    const done: number[] = [];
    const tasks = [
      async () => { done.push(0); },
      async () => { throw new Error("boom"); },
      async () => { done.push(2); },
    ];
    await runWithConcurrency(tasks, 2); // 실패해도 reject하지 않음
    expect(done.sort()).toEqual([0, 2]);
  });
});
```

```ts
// src/lib/pipeline/serverScan.ts (동시성 헬퍼 부분)
export async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        await tasks[index]();
      } catch {
        // fleet scan: 개별 실패를 격리하고 나머지는 계속 진행
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}
```

`scanServerAsset` / `scanProjectFleet` 본체(실제 run 상태 전이 + `runAnsibleForServer` + `retryOnConnectionFailure` 호출)는 기존 컨테이너 오케스트레이터(`src/lib/pipeline/orchestrator.ts`)의 단계 전이 패턴을 참고해 작성한다. 서버 단계는 `connect → ansible_scan → rule_evaluation → claude_analysis → done`. `scanProjectFleet`는:

```ts
export async function scanProjectFleet(projectId: string): Promise<{ batchId: string; runIds: string[] }> {
  const batch = createScanBatch(projectId);
  const servers = listAssets({ projectId, type: "server" });
  const runIds: string[] = [];
  const tasks = servers.map((asset) => async () => {
    const runId = await scanServerAsset(asset.id, batch.id);
    runIds.push(runId);
  });
  await runWithConcurrency(tasks, 5);
  return { batchId: batch.id, runIds };
}
```

(위 `scanServerAsset`가 runId를 반환하도록 시그니처를 `Promise<string>`로 둔다.)

- [ ] **Step 3: 테스트 통과 확인 → 커밋**

```bash
npx vitest run src/lib/pipeline/scanBatches.test.ts src/lib/pipeline/serverScan.test.ts
git add src/lib/pipeline/serverScan.ts src/lib/pipeline/scanBatches.ts src/lib/pipeline/*.test.ts src/lib/pipeline/runs.ts
git commit -m "feat: 서버 스캔 오케스트레이터와 fleet scan(batch, 동시성 5) 추가"
```

---

### Task 7: API + UI — 서버 스캔 실행 및 배치 조회

**Files:**
- Modify: `src/app/api/runs/route.ts` (A1 Task 14에서 서버 자산에 501 반환하던 것을 실제 실행으로 교체)
- Create: `src/app/api/projects/[id]/scan/route.ts` (fleet scan 트리거)
- Create: `src/app/runs/batch/[batchId]/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx` (fleet scan 버튼 추가 — 기존 A1 파일에 버튼 컴포넌트 추가)
- Modify: `src/app/runs/[id]/RunStatus.tsx` 또는 단계 렌더링 부분 (source_type=server면 4단계 목록 사용)

**Interfaces:**
- Consumes: `scanServerAsset`, `scanProjectFleet`, `listRunsByBatch` (`@/lib/pipeline/serverScan`, `@/lib/pipeline/scanBatches`), `getAsset` (`@/lib/assets/store`)

- [ ] **Step 1: 단건 서버 스캔 — `/api/runs` POST의 server 분기 교체**

A1 Task 14에서 서버 자산에 `501`을 반환하던 부분을 실제 실행으로 바꾼다:

```ts
// src/app/api/runs/route.ts 의 server 분기
if (asset.type === "server") {
  const runId = await import("@/lib/pipeline/serverScan").then((m) => m.scanServerAsset(asset.id, null));
  // scanServerAsset이 fire-and-forget이면 void로, run을 먼저 만들고 즉시 202 반환하는 기존 패턴에 맞춘다
  return NextResponse.json({ runId }, { status: 202 });
}
```

> 기존 컨테이너 경로는 `createRun` 후 `void runPipeline(...)`로 즉시 202를 반환한다. 서버 경로도 동일하게, `scanServerAsset` 내부에서 run을 먼저 생성하고 백그라운드로 파이프라인을 돌린 뒤 runId만 반환하도록 맞춘다(실제 스캔 완료를 기다리지 않음).

- [ ] **Step 2: fleet scan API**

```ts
// src/app/api/projects/[id]/scan/route.ts
import { NextResponse } from "next/server";
import { scanProjectFleet } from "@/lib/pipeline/serverScan";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await scanProjectFleet(id);
  return NextResponse.json(result, { status: 202 });
}
```

- [ ] **Step 3: 배치 결과 페이지**

```tsx
// src/app/runs/batch/[batchId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { listRunsByBatch } from "@/lib/pipeline/scanBatches";

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const runs = listRunsByBatch(batchId);
  if (runs.length === 0) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-4 text-lg font-bold text-[var(--color-text)]">일괄 점검 결과 ({runs.length}대)</h1>
      <ul className="text-sm">
        {runs.map((run) => (
          <li key={run.id} className="border-b border-[var(--color-border)] py-2">
            <Link href={`/runs/${run.id}`} className="text-[var(--color-primary)]">{run.repoUrl}</Link>
            <span className="ml-2 text-[var(--color-muted)]">{run.status}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: fleet scan 버튼 (프로젝트 상세)**

A1의 `src/app/projects/[id]/page.tsx`에 client 버튼 컴포넌트를 추가한다 (`FleetScanButton.tsx`, `"use client"`): 클릭 시 `POST /api/projects/[id]/scan` → 응답의 `batchId`로 `/runs/batch/[batchId]` 이동.

- [ ] **Step 5: 서버 단계 렌더링**

`RunStatus.tsx`(또는 단계 목록 렌더링부)에서 `run.sourceType === "server"`면 `["connect", "ansible_scan", "rule_evaluation", "claude_analysis", "done"]`를, 아니면 기존 6단계를 사용하도록 분기한다.

- [ ] **Step 6: 수동 확인**

`INFRA_SECURITY_MASTER_KEY`를 `.env`에 설정 → 실제 접근 가능한 테스트 서버(또는 로컬 sshd 컨테이너)를 서버 자산으로 등록 → `/runs`에서 단건 스캔 → 4단계 진행 확인. 프로젝트에 서버 2대 이상 넣고 fleet scan → batch 페이지에서 각 run 상태 확인. 잘못된 비밀번호로 등록한 서버는 즉시 fail(재시도 없이)인지 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/app/api/runs/route.ts src/app/api/projects/ src/app/runs/batch/ src/app/projects/ src/app/runs/
git commit -m "feat: 서버 단건/일괄(fleet) 스캔 API·UI 및 배치 결과 페이지 추가"
```

---

### Task 8: playbook 안전성 재검토 (ansible-playbook-reviewer)

**Files:** 없음 (검토 전용)

- [ ] **Step 1: 서브에이전트 실행**

`ansible-playbook-reviewer` 서브에이전트를 실행해 `ansible/security-checks.yml`과 새 SSH 실행 경로(`ansibleRunner.ts`의 `runAnsibleForServer`/`runAnsibleWithArgs`)를 검토한다. 특히:
- 컨테이너 전제(예: 특정 경로가 항상 존재한다는 가정)가 실서버에서 fail-safe 없이 깨지는 태스크가 있는지
- `ansible_ssh_pass`가 args/로그에 노출되지 않는지 (Task 2·4의 핵심)
- 실서버 대상 read-only 보장(쓰기/변경 명령 부재)
- 5분 타임아웃 내 완료 가능성

- [ ] **Step 2: 발견 사항 반영**

CONFIRMED 이슈가 있으면 별도 커밋으로 수정한다. PLAUSIBLE만 있으면 문서에 기록하고 넘어간다.

```bash
git add -A
git commit -m "fix: ansible-playbook-reviewer 지적 사항 반영 (서버 SSH 실행 안전성)"
```

---

## Self-Review 메모

- **스펙 커버리지**: 연결 방식 분기(Task 2,4) · 동시성/타임아웃/재시도(Task 5,6) · 파이프라인 단계(Task 6,7) · 데이터 모델(Task 1) · 암호화 재사용(Task 2~4, A1의 secretCipher) · UI(Task 7) · 자격증명 비노출(Task 2,3,4 + Task 8 검토) 모두 매핑됨.
- **A1 의존**: 이 계획은 A1 완료(특히 Task 2 secretCipher, 서버 자산 `encrypted_secret` 저장, `Run.assetId`)를 전제로 한다. A1 미완 상태에서 시작하지 않는다.
- **테스트 가능성**: 실제 SSH 연결은 통합 성격이라 순수 로직(커맨드 빌더/키파일/재시도/동시성)만 유닛 테스트하고, 실제 서버 대상 실행은 Task 7 Step 6 수동 확인으로 커버한다. 이는 기존 코드베이스가 실제 Docker 실행을 유닛 테스트하지 않는 것과 동일한 경계다.
- **미확정 사항**: Task 4의 기존 spawn 헬퍼 리팩터링(`runAnsibleWithArgs`)과 Task 6의 run 상태 전이 함수명은 실제 `ansibleRunner.ts`/`orchestrator.ts`를 열어 기존 이름에 맞춘다. 실행자가 Read로 확인 후 진행.
