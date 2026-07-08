# A1: 자산 관리 + 프로젝트 그룹핑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레포/서버 자산을 등록·프로젝트 단위로 그룹핑하고, 엑셀 일괄 업로드와 PM용 읽기전용 공유링크를 제공한다. `/runs`의 URL 직접입력 방식을 "등록된 자산 선택" 방식으로 전환한다.

**Architecture:** 기존 `better-sqlite3` 단일 파일 DB에 `projects`/`assets` 테이블을 추가하고, `runs.asset_id` FK로 실행 이력을 자산에 연결한다. 데이터 접근은 기존 `src/lib/pipeline/runs.ts` 패턴(함수가 `db: Database = getDb()`를 기본 인자로 받음)을 그대로 따른다. API 라우트는 기존 `src/app/api/runs/route.ts` 스타일(수동 타입 검증, `NextResponse.json`)을 따른다. UI는 목록/상세는 async Server Component, 인터랙션이 필요한 부분만 별도 client 컴포넌트로 분리하는 기존 패턴을 따른다.

**Tech Stack:** Next.js 16.2.9 (App Router) / React 19 / TypeScript strict / better-sqlite3 / Vitest / Tailwind v4. 신규 의존성: `xlsx`(엑셀 파싱, SheetJS) 1개만 추가한다. 비밀번호 해시·AES 암호화는 Node 내장 `crypto` 모듈만 사용한다 (기존 코드베이스에 bcrypt/crypto-js가 전혀 없으므로 새 암호 라이브러리를 넣지 않는다).

## Global Constraints

- Next.js 16 App Router 규칙: 동적 라우트 `params`와 `searchParams`는 항상 `Promise`이며 `await`로 해석한다.
- 모든 신규 lib 함수는 마지막 인자로 `db: Database = getDb()`를 받아 테스트에서 `createInMemoryDb()`로 주입 가능해야 한다.
- API 에러 메시지는 한국어로 작성한다 (`NextResponse.json({ error: "..." }, { status })`).
- 테스트는 Vitest, 대상 파일과 같은 디렉터리에 `*.test.ts`로 co-locate한다.
- DB 스키마 변경은 `src/lib/db/index.ts`의 `SCHEMA` 문자열에 `CREATE TABLE IF NOT EXISTS`를 추가하고, 기존 테이블(`runs`)에 컬럼을 추가할 때는 `migrate()`에 `PRAGMA table_info` 기반 idempotent `ALTER TABLE`을 추가한다 (기존 `source_type` 컬럼 추가 방식과 동일).
- 신규 UI 컴포넌트는 `src/app/_components`의 기존 스타일(이름 있는 함수 컴포넌트, config 배열로 반복 마크업 구동, Tailwind + `var(--color-*)` CSS 변수)을 따른다. 범용 `<Table>`/`<Button>` 컴포넌트를 새로 만들지 않는다 — 기존 코드베이스에 없다.
- 비밀번호(공유링크)·비밀값(SSH 자격증명) 원문은 로그, API 응답, Claude 전달 payload 어디에도 남기지 않는다.

---

### Task 1: DB 스키마 — `projects`, `assets` 테이블 및 `runs.asset_id` 컬럼

**Files:**
- Modify: `src/lib/db/index.ts`
- Test: `src/lib/db/index.test.ts` (신규)

**Interfaces:**
- Produces: `projects` 테이블(`id, name, pm_name, pm_email, share_token, share_password_hash, share_failed_attempts, share_locked_until, created_at`), `assets` 테이블(`id, type, project_id, display_name, repo_url, host_ip, hostname, ssh_port, auth_type, username, encrypted_secret, created_at`), `runs.asset_id` 컬럼(nullable TEXT).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/db/index.test.ts
import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "./index";

describe("schema", () => {
  it("creates projects and assets tables with runs.asset_id column", () => {
    const db = createInMemoryDb();

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain("projects");
    expect(tables).toContain("assets");

    const runColumns = db
      .prepare(`PRAGMA table_info(runs)`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(runColumns).toContain("asset_id");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/db/index.test.ts`
Expected: FAIL (`projects`/`assets` 테이블 없음, `asset_id` 컬럼 없음)

- [ ] **Step 3: 스키마 추가**

`src/lib/db/index.ts`의 `SCHEMA` 문자열 안, 기존 `runs` 테이블 정의 뒤에 추가:

```ts
const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'git',
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  image_tag TEXT,
  container_name TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  item_id TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  remediation TEXT NOT NULL,
  example TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pm_name TEXT NOT NULL,
  pm_email TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  share_password_hash TEXT NOT NULL,
  share_failed_attempts INTEGER NOT NULL DEFAULT 0,
  share_locked_until TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  display_name TEXT NOT NULL,
  repo_url TEXT,
  host_ip TEXT,
  hostname TEXT,
  ssh_port INTEGER,
  auth_type TEXT,
  username TEXT,
  encrypted_secret TEXT,
  created_at TEXT NOT NULL
);
`;
```

`migrate()` 함수에 `asset_id` 컬럼 추가 로직을 덧붙인다:

```ts
function migrate(db: Database.Database): void {
  const runColumns = db.prepare(`PRAGMA table_info(runs)`).all() as { name: string }[];
  if (!runColumns.some((column) => column.name === "source_type")) {
    db.exec(`ALTER TABLE runs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'git'`);
  }
  if (!runColumns.some((column) => column.name === "asset_id")) {
    db.exec(`ALTER TABLE runs ADD COLUMN asset_id TEXT REFERENCES assets(id)`);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/db/index.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/index.ts src/lib/db/index.test.ts
git commit -m "feat: projects/assets 테이블과 runs.asset_id 컬럼 추가"
```

---

### Task 2: 암호화 유틸 — `secretCipher` (AES-256-GCM)

**Files:**
- Create: `src/lib/crypto/secretCipher.ts`
- Test: `src/lib/crypto/secretCipher.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: string): string`, `decryptSecret(cipherText: string): string` — 둘 다 `INFRA_SECURITY_MASTER_KEY` 환경변수(base64, 32바이트)를 키로 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/crypto/secretCipher.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret } from "./secretCipher";

beforeEach(() => {
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("secretCipher", () => {
  it("round-trips a plaintext secret", () => {
    const cipherText = encryptSecret("my-ssh-password");
    expect(decryptSecret(cipherText)).toBe("my-ssh-password");
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("throws a clear error when INFRA_SECURITY_MASTER_KEY is missing", () => {
    delete process.env.INFRA_SECURITY_MASTER_KEY;
    expect(() => encryptSecret("x")).toThrow(/INFRA_SECURITY_MASTER_KEY/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/crypto/secretCipher.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/crypto/secretCipher.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const encoded = process.env.INFRA_SECURITY_MASTER_KEY;
  if (!encoded) {
    throw new Error(
      "INFRA_SECURITY_MASTER_KEY 환경변수가 설정되지 않았습니다. README의 키 생성 방법을 참고하세요.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("INFRA_SECURITY_MASTER_KEY는 base64로 인코딩된 32바이트 키여야 합니다.");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(cipherText: string): string {
  const key = loadKey();
  const [ivB64, authTagB64, encryptedB64] = cipherText.split(":");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/crypto/secretCipher.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/crypto/secretCipher.ts src/lib/crypto/secretCipher.test.ts
git commit -m "feat: AES-256-GCM 기반 자격증명 암호화 유틸 추가"
```

---

### Task 3: 공유링크 비밀번호 해시 — `sharePassword`

**Files:**
- Create: `src/lib/crypto/sharePassword.ts`
- Test: `src/lib/crypto/sharePassword.test.ts`

**Interfaces:**
- Consumes: 없음 (독립 모듈, Node 내장 `crypto.scrypt`만 사용)
- Produces: `hashSharePassword(plain: string): string` (형식: `salt:hash`, 둘 다 hex), `verifySharePassword(plain: string, stored: string): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/crypto/sharePassword.test.ts
import { describe, expect, it } from "vitest";
import { hashSharePassword, verifySharePassword } from "./sharePassword";

describe("sharePassword", () => {
  it("verifies a correct password against its hash", () => {
    const hash = hashSharePassword("hunter2");
    expect(verifySharePassword("hunter2", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashSharePassword("hunter2");
    expect(verifySharePassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    expect(hashSharePassword("same")).not.toBe(hashSharePassword("same"));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/crypto/sharePassword.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/crypto/sharePassword.ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function hashSharePassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifySharePassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(plain, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/crypto/sharePassword.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/crypto/sharePassword.ts src/lib/crypto/sharePassword.test.ts
git commit -m "feat: 공유링크 비밀번호 해시/검증 유틸 추가 (scrypt)"
```

---

### Task 4: 레포 URL 정규화 (dedupe용)

**Files:**
- Modify: `src/lib/pipeline/repoUrl.ts`
- Test: `src/lib/pipeline/repoUrl.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `normalizeRepoUrl(url: string): string` — 트레일링 슬래시 제거, `.git` 접미사 제거, host 소문자화

- [ ] **Step 1: 실패하는 테스트 작성**

기존 `src/lib/pipeline/repoUrl.test.ts` 파일에 아래 `describe` 블록을 추가하고, import 문에 `normalizeRepoUrl`을 추가:

```ts
import { getRepoDisplayName, isValidRepoUrl, normalizeRepoUrl } from "./repoUrl";

describe("normalizeRepoUrl", () => {
  it("removes trailing slash and .git suffix", () => {
    expect(normalizeRepoUrl("https://github.com/owner/repo.git")).toBe(
      "https://github.com/owner/repo",
    );
    expect(normalizeRepoUrl("https://github.com/owner/repo/")).toBe(
      "https://github.com/owner/repo",
    );
  });

  it("lowercases the host", () => {
    expect(normalizeRepoUrl("https://GitHub.com/owner/repo")).toBe(
      "https://github.com/owner/repo",
    );
  });

  it("treats equivalent URLs as identical after normalization", () => {
    const a = normalizeRepoUrl("https://github.com/owner/repo.git");
    const b = normalizeRepoUrl("https://GitHub.com/owner/repo/");
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/pipeline/repoUrl.test.ts`
Expected: FAIL (`normalizeRepoUrl` export 없음)

- [ ] **Step 3: 최소 구현**

`src/lib/pipeline/repoUrl.ts`에 추가:

```ts
export function normalizeRepoUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  try {
    const parsed = new URL(trimmed);
    parsed.host = parsed.host.toLowerCase();
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/pipeline/repoUrl.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/pipeline/repoUrl.ts src/lib/pipeline/repoUrl.test.ts
git commit -m "feat: 자산 dedupe용 레포 URL 정규화 함수 추가"
```

---

### Task 5: 자산 store — CRUD + dedupe 조회

**Files:**
- Create: `src/lib/assets/types.ts`
- Create: `src/lib/assets/store.ts`
- Test: `src/lib/assets/store.test.ts`

**Interfaces:**
- Consumes: `getDb`, `createInMemoryDb` (`@/lib/db`), `normalizeRepoUrl` (`@/lib/pipeline/repoUrl`), `encryptSecret` (`@/lib/crypto/secretCipher`), `createRun` (`@/lib/pipeline/runs`, 테스트에서만)
- Produces:
  - `type Asset` (types.ts — 아래 Step 3)
  - `class DuplicateAssetError extends Error`, `class AssetInUseError extends Error`
  - `createRepoAsset(input: { displayName: string; repoUrl: string; projectId?: string | null }, db?): Asset`
  - `createServerAsset(input: { displayName: string; hostIp: string; hostname: string; sshPort: number; authType: "password"|"key"; username: string; secret: string; projectId?: string | null }, db?): Asset`
  - `listAssets(filter?: { projectId?: string | null; type?: "repo" | "server" }, db?): Asset[]`
  - `getAsset(id: string, db?): Asset | undefined`
  - `deleteAsset(id: string, db?): void` — 진행 중인 run(`status = 'running'`)이 있으면 `AssetInUseError`, 아니면 관련 run과 함께 hard delete

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/assets/store.test.ts
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import {
  AssetInUseError,
  DuplicateAssetError,
  createRepoAsset,
  createServerAsset,
  deleteAsset,
  getAsset,
  listAssets,
} from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("createRepoAsset", () => {
  it("creates a repo asset unassigned to any project by default", () => {
    const asset = createRepoAsset(
      { displayName: "nh-pay-gateway", repoUrl: "https://github.com/nh/pay.git" },
      db,
    );
    expect(asset.type).toBe("repo");
    expect(asset.projectId).toBeNull();
  });

  it("rejects a duplicate repo URL after normalization", () => {
    createRepoAsset({ displayName: "a", repoUrl: "https://github.com/nh/pay.git" }, db);
    expect(() =>
      createRepoAsset({ displayName: "b", repoUrl: "https://github.com/nh/pay/" }, db),
    ).toThrow(DuplicateAssetError);
  });
});

describe("createServerAsset", () => {
  it("encrypts the secret before storing", () => {
    const asset = createServerAsset(
      {
        displayName: "web-01", hostIp: "10.0.0.5", hostname: "web-01.internal",
        sshPort: 22, authType: "password", username: "admin", secret: "plaintext-password",
      },
      db,
    );
    expect(asset.encryptedSecret).not.toBe("plaintext-password");
    expect(asset.encryptedSecret).toContain(":");
  });

  it("rejects a duplicate host_ip + ssh_port combination", () => {
    createServerAsset(
      { displayName: "a", hostIp: "10.0.0.5", hostname: "a", sshPort: 22, authType: "password", username: "admin", secret: "x" },
      db,
    );
    expect(() =>
      createServerAsset(
        { displayName: "b", hostIp: "10.0.0.5", hostname: "b", sshPort: 22, authType: "password", username: "admin", secret: "y" },
        db,
      ),
    ).toThrow(DuplicateAssetError);
  });
});

describe("listAssets", () => {
  it("filters by type and unassigned project", () => {
    createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    createRepoAsset({ displayName: "b", repoUrl: "https://github.com/x/b" }, db);
    expect(listAssets({ type: "repo" }, db)).toHaveLength(2);
    expect(listAssets({ projectId: null }, db)).toHaveLength(2);
  });
});

describe("deleteAsset", () => {
  it("hard-deletes an asset with no running runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    deleteAsset(asset.id, db);
    expect(getAsset(asset.id, db)).toBeUndefined();
  });

  it("blocks deletion when a run is still running", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun(asset.repoUrl!, "git", db);
    db.prepare(`UPDATE runs SET asset_id = ?, status = 'running' WHERE id = ?`).run(asset.id, run.id);
    expect(() => deleteAsset(asset.id, db)).toThrow(AssetInUseError);
  });

  it("cascades run deletion when the asset had completed runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun(asset.repoUrl!, "git", db);
    db.prepare(`UPDATE runs SET asset_id = ?, status = 'done' WHERE id = ?`).run(asset.id, run.id);
    deleteAsset(asset.id, db);
    expect(db.prepare(`SELECT * FROM runs WHERE id = ?`).get(run.id)).toBeUndefined();
  });
});
```

> **주의:** 이 테스트는 `createRun`의 시그니처가 `(source, sourceType, db)`임을 가정한다. Task 8 Step 2에서 `createRun`에 `assetId` 인자가 추가되면 시그니처가 `(source, sourceType, assetId, db)`로 바뀐다. Task 5를 Task 8보다 먼저 실행하는 경우 위 테스트의 `createRun(asset.repoUrl!, "git", db)` 호출은 현재 시그니처 그대로 두고, Task 8 완료 후 `createRun(asset.repoUrl!, "git", null, db)`로 갱신한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/assets/store.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 타입 정의**

```ts
// src/lib/assets/types.ts
export type AssetType = "repo" | "server";
export type ServerAuthType = "password" | "key";

export interface Asset {
  id: string;
  type: AssetType;
  projectId: string | null;
  displayName: string;
  repoUrl: string | null;
  hostIp: string | null;
  hostname: string | null;
  sshPort: number | null;
  authType: ServerAuthType | null;
  username: string | null;
  encryptedSecret: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: 최소 구현**

```ts
// src/lib/assets/store.ts
import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { normalizeRepoUrl } from "@/lib/pipeline/repoUrl";
import { encryptSecret } from "@/lib/crypto/secretCipher";
import type { Asset, AssetType, ServerAuthType } from "./types";

export class DuplicateAssetError extends Error {}
export class AssetInUseError extends Error {}

interface AssetRow {
  id: string;
  type: AssetType;
  project_id: string | null;
  display_name: string;
  repo_url: string | null;
  host_ip: string | null;
  hostname: string | null;
  ssh_port: number | null;
  auth_type: ServerAuthType | null;
  username: string | null;
  encrypted_secret: string | null;
  created_at: string;
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    type: row.type,
    projectId: row.project_id,
    displayName: row.display_name,
    repoUrl: row.repo_url,
    hostIp: row.host_ip,
    hostname: row.hostname,
    sshPort: row.ssh_port,
    authType: row.auth_type,
    username: row.username,
    encryptedSecret: row.encrypted_secret,
    createdAt: row.created_at,
  };
}

const INSERT_SQL = `INSERT INTO assets (id, type, project_id, display_name, repo_url, host_ip, hostname, ssh_port, auth_type, username, encrypted_secret, created_at)
     VALUES (@id, @type, @project_id, @display_name, @repo_url, @host_ip, @hostname, @ssh_port, @auth_type, @username, @encrypted_secret, @created_at)`;

export function createRepoAsset(
  input: { displayName: string; repoUrl: string; projectId?: string | null },
  db: Database = getDb(),
): Asset {
  const normalized = normalizeRepoUrl(input.repoUrl);
  const existing = db
    .prepare(`SELECT * FROM assets WHERE type = 'repo' AND repo_url = ?`)
    .get(normalized) as AssetRow | undefined;
  if (existing) {
    throw new DuplicateAssetError(`이미 등록된 레포입니다: ${normalized}`);
  }

  const row: AssetRow = {
    id: randomUUID(),
    type: "repo",
    project_id: input.projectId ?? null,
    display_name: input.displayName,
    repo_url: normalized,
    host_ip: null, hostname: null, ssh_port: null, auth_type: null, username: null, encrypted_secret: null,
    created_at: new Date().toISOString(),
  };
  db.prepare(INSERT_SQL).run(row);
  return toAsset(row);
}

export function createServerAsset(
  input: {
    displayName: string; hostIp: string; hostname: string; sshPort: number;
    authType: ServerAuthType; username: string; secret: string; projectId?: string | null;
  },
  db: Database = getDb(),
): Asset {
  const existing = db
    .prepare(`SELECT * FROM assets WHERE type = 'server' AND host_ip = ? AND ssh_port = ?`)
    .get(input.hostIp, input.sshPort) as AssetRow | undefined;
  if (existing) {
    throw new DuplicateAssetError(`이미 등록된 서버입니다: ${input.hostIp}:${input.sshPort}`);
  }

  const row: AssetRow = {
    id: randomUUID(),
    type: "server",
    project_id: input.projectId ?? null,
    display_name: input.displayName,
    repo_url: null,
    host_ip: input.hostIp,
    hostname: input.hostname,
    ssh_port: input.sshPort,
    auth_type: input.authType,
    username: input.username,
    encrypted_secret: encryptSecret(input.secret),
    created_at: new Date().toISOString(),
  };
  db.prepare(INSERT_SQL).run(row);
  return toAsset(row);
}

export function listAssets(
  filter: { projectId?: string | null; type?: AssetType } = {},
  db: Database = getDb(),
): Asset[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.projectId !== undefined) {
    if (filter.projectId === null) {
      conditions.push("project_id IS NULL");
    } else {
      conditions.push("project_id = @projectId");
      params.projectId = filter.projectId;
    }
  }
  if (filter.type) {
    conditions.push("type = @type");
    params.type = filter.type;
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM assets ${where} ORDER BY created_at DESC`).all(params) as AssetRow[];
  return rows.map(toAsset);
}

export function getAsset(id: string, db: Database = getDb()): Asset | undefined {
  const row = db.prepare(`SELECT * FROM assets WHERE id = ?`).get(id) as AssetRow | undefined;
  return row ? toAsset(row) : undefined;
}

export function deleteAsset(id: string, db: Database = getDb()): void {
  const runningRun = db
    .prepare(`SELECT id FROM runs WHERE asset_id = ? AND status = 'running'`)
    .get(id);
  if (runningRun) {
    throw new AssetInUseError("실행 중인 점검이 있어 삭제할 수 없습니다");
  }
  const deleteTransaction = db.transaction(() => {
    db.prepare(`DELETE FROM runs WHERE asset_id = ?`).run(id);
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(id);
  });
  deleteTransaction();
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/assets/store.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/assets/
git commit -m "feat: 자산(레포/서버) store CRUD 및 dedupe 로직 추가"
```

---

### Task 6: 프로젝트 store — CRUD + 공유링크 발급/검증

**Files:**
- Create: `src/lib/projects/types.ts`
- Create: `src/lib/projects/store.ts`
- Test: `src/lib/projects/store.test.ts`

**Interfaces:**
- Consumes: `hashSharePassword`, `verifySharePassword` (`@/lib/crypto/sharePassword`), `getDb`/`createInMemoryDb` (`@/lib/db`), `createRepoAsset`/`getAsset` (`@/lib/assets/store`, 테스트에서만)
- Produces:
  - `type Project = { id: string; name: string; pmName: string; pmEmail: string; shareToken: string; createdAt: string }`
  - `createProject(input: { name: string; pmName: string; pmEmail: string; sharePassword: string }, db?): Project`
  - `listProjects(db?): Project[]`
  - `getProject(id: string, db?): Project | undefined`
  - `updateProject(id: string, input: { name?: string; pmName?: string; pmEmail?: string }, db?): Project`
  - `deleteProject(id: string, db?): void` — 소속 자산은 `project_id = NULL`로 이동 후 프로젝트 삭제
  - `regenerateShareLink(id: string, newPassword: string, db?): { shareToken: string }`
  - `verifyShareAccess(token: string, password: string, db?): { ok: true; project: Project } | { ok: false; reason: "not_found" | "locked" | "wrong_password" }` — 5회 실패 시 15분 잠금

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/projects/store.test.ts
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset, getAsset } from "@/lib/assets/store";
import {
  createProject,
  deleteProject,
  getProject,
  regenerateShareLink,
  verifyShareAccess,
} from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("createProject", () => {
  it("creates a project with a unique share token", () => {
    const a = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw1" }, db);
    const b = createProject({ name: "B", pmName: "이PM", pmEmail: "b@nh.com", sharePassword: "pw2" }, db);
    expect(a.shareToken).not.toBe(b.shareToken);
  });
});

describe("deleteProject", () => {
  it("moves owned assets to unclassified instead of deleting them", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const asset = createRepoAsset({ displayName: "x", repoUrl: "https://github.com/x/x", projectId: project.id }, db);
    deleteProject(project.id, db);
    expect(getProject(project.id, db)).toBeUndefined();
    expect(getAsset(asset.id, db)?.projectId).toBeNull();
  });
});

describe("verifyShareAccess", () => {
  it("succeeds with the correct token and password", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "correct-pw" }, db);
    expect(verifyShareAccess(project.shareToken, "correct-pw", db).ok).toBe(true);
  });

  it("fails with the wrong password", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "correct-pw" }, db);
    expect(verifyShareAccess(project.shareToken, "wrong-pw", db)).toEqual({ ok: false, reason: "wrong_password" });
  });

  it("returns not_found for an unknown token", () => {
    expect(verifyShareAccess("unknown-token", "any", db)).toEqual({ ok: false, reason: "not_found" });
  });

  it("locks the project after 5 failed attempts", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "correct-pw" }, db);
    for (let i = 0; i < 5; i++) verifyShareAccess(project.shareToken, "wrong", db);
    expect(verifyShareAccess(project.shareToken, "correct-pw", db)).toEqual({ ok: false, reason: "locked" });
  });

  it("resets the failure counter after regenerating the share link", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "old-pw" }, db);
    for (let i = 0; i < 5; i++) verifyShareAccess(project.shareToken, "wrong", db);
    const { shareToken } = regenerateShareLink(project.id, "new-pw", db);
    expect(verifyShareAccess(shareToken, "new-pw", db)).toEqual(expect.objectContaining({ ok: true }));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/projects/store.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 타입 정의**

```ts
// src/lib/projects/types.ts
export interface Project {
  id: string;
  name: string;
  pmName: string;
  pmEmail: string;
  shareToken: string;
  createdAt: string;
}
```

- [ ] **Step 4: 최소 구현**

```ts
// src/lib/projects/store.ts
import type { Database } from "better-sqlite3";
import { randomBytes, randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { hashSharePassword, verifySharePassword } from "@/lib/crypto/sharePassword";
import type { Project } from "./types";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

interface ProjectRow {
  id: string;
  name: string;
  pm_name: string;
  pm_email: string;
  share_token: string;
  share_password_hash: string;
  share_failed_attempts: number;
  share_locked_until: string | null;
  created_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    pmName: row.pm_name,
    pmEmail: row.pm_email,
    shareToken: row.share_token,
    createdAt: row.created_at,
  };
}

export function createProject(
  input: { name: string; pmName: string; pmEmail: string; sharePassword: string },
  db: Database = getDb(),
): Project {
  const row: ProjectRow = {
    id: randomUUID(),
    name: input.name,
    pm_name: input.pmName,
    pm_email: input.pmEmail,
    share_token: randomBytes(24).toString("base64url"),
    share_password_hash: hashSharePassword(input.sharePassword),
    share_failed_attempts: 0,
    share_locked_until: null,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO projects (id, name, pm_name, pm_email, share_token, share_password_hash, share_failed_attempts, share_locked_until, created_at)
     VALUES (@id, @name, @pm_name, @pm_email, @share_token, @share_password_hash, @share_failed_attempts, @share_locked_until, @created_at)`,
  ).run(row);
  return toProject(row);
}

export function listProjects(db: Database = getDb()): Project[] {
  const rows = db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: string, db: Database = getDb()): Project | undefined {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  return row ? toProject(row) : undefined;
}

export function updateProject(
  id: string,
  input: { name?: string; pmName?: string; pmEmail?: string },
  db: Database = getDb(),
): Project {
  const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow;
  const updated: ProjectRow = {
    ...existing,
    name: input.name ?? existing.name,
    pm_name: input.pmName ?? existing.pm_name,
    pm_email: input.pmEmail ?? existing.pm_email,
  };
  db.prepare(`UPDATE projects SET name = @name, pm_name = @pm_name, pm_email = @pm_email WHERE id = @id`).run(updated);
  return toProject(updated);
}

export function deleteProject(id: string, db: Database = getDb()): void {
  const transaction = db.transaction(() => {
    db.prepare(`UPDATE assets SET project_id = NULL WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  transaction();
}

export function regenerateShareLink(
  id: string,
  newPassword: string,
  db: Database = getDb(),
): { shareToken: string } {
  const shareToken = randomBytes(24).toString("base64url");
  db.prepare(
    `UPDATE projects SET share_token = ?, share_password_hash = ?, share_failed_attempts = 0, share_locked_until = NULL WHERE id = ?`,
  ).run(shareToken, hashSharePassword(newPassword), id);
  return { shareToken };
}

export function verifyShareAccess(
  token: string,
  password: string,
  db: Database = getDb(),
): { ok: true; project: Project } | { ok: false; reason: "not_found" | "locked" | "wrong_password" } {
  const row = db.prepare(`SELECT * FROM projects WHERE share_token = ?`).get(token) as ProjectRow | undefined;
  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  if (row.share_locked_until && new Date(row.share_locked_until) > new Date()) {
    return { ok: false, reason: "locked" };
  }

  if (!verifySharePassword(password, row.share_password_hash)) {
    const attempts = row.share_failed_attempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : null;
    db.prepare(`UPDATE projects SET share_failed_attempts = ?, share_locked_until = ? WHERE id = ?`).run(attempts, lockedUntil, row.id);
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "locked" : "wrong_password" };
  }

  db.prepare(`UPDATE projects SET share_failed_attempts = 0, share_locked_until = NULL WHERE id = ?`).run(row.id);
  return { ok: true, project: toProject(row) };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/projects/store.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/projects/
git commit -m "feat: 프로젝트 store CRUD 및 공유링크 발급/검증(잠금 포함) 추가"
```

---

### Task 7: 엑셀 일괄 업로드 파서

**Files:**
- Modify: `package.json` (`xlsx` 의존성 추가)
- Create: `src/lib/assets/excelImport.ts`
- Test: `src/lib/assets/excelImport.test.ts`

**Interfaces:**
- Consumes: `createRepoAsset`, `createServerAsset`, `DuplicateAssetError` (`./store`)
- Produces:
  - `type ImportRowResult = { row: number; ok: true; assetId: string } | { row: number; ok: false; reason: string }`
  - `importAssetsFromWorkbook(buffer: Buffer, projectId: string | null, db?): { repo: ImportRowResult[]; server: ImportRowResult[] }` — `repo`/`server` 시트 각각 파싱, 시트 없으면 빈 배열

- [ ] **Step 1: 의존성 설치 후 실패하는 테스트 작성**

```bash
npm install xlsx
```

```ts
// src/lib/assets/excelImport.test.ts
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import * as XLSX from "xlsx";
import { createInMemoryDb } from "@/lib/db";
import { listAssets } from "./store";
import { importAssetsFromWorkbook } from "./excelImport";

let db: Database;

function buildWorkbook(sheets: Record<string, Record<string, unknown>[]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("importAssetsFromWorkbook", () => {
  it("imports valid repo rows and reports success per row", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a" },
        { display_name: "b", repo_url: "https://github.com/x/b" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo).toHaveLength(2);
    expect(result.repo.every((r) => r.ok)).toBe(true);
    expect(listAssets({ type: "repo" }, db)).toHaveLength(2);
  });

  it("reports a per-row failure for missing required fields without aborting the batch", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a" },
        { display_name: "no-url" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[0]).toMatchObject({ ok: true });
    expect(result.repo[1]).toMatchObject({ ok: false });
    expect(listAssets({ type: "repo" }, db)).toHaveLength(1);
  });

  it("reports a per-row failure for a duplicate repo_url", () => {
    const buffer = buildWorkbook({
      repo: [
        { display_name: "a", repo_url: "https://github.com/x/a" },
        { display_name: "dup", repo_url: "https://github.com/x/a" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.repo[1]).toMatchObject({ ok: false });
  });

  it("imports valid server rows with encrypted secrets", () => {
    const buffer = buildWorkbook({
      server: [
        { display_name: "web-01", host_ip: "10.0.0.5", hostname: "web-01", ssh_port: 22, auth_type: "password", username: "admin", secret: "pw" },
      ],
    });
    const result = importAssetsFromWorkbook(buffer, null, db);
    expect(result.server).toHaveLength(1);
    expect(result.server[0]).toMatchObject({ ok: true });
    expect(listAssets({ type: "server" }, db)).toHaveLength(1);
  });

  it("returns empty arrays for sheets that are absent", () => {
    const buffer = buildWorkbook({ repo: [{ display_name: "a", repo_url: "https://github.com/x/a" }] });
    expect(importAssetsFromWorkbook(buffer, null, db).server).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/assets/excelImport.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/assets/excelImport.ts
import type { Database } from "better-sqlite3";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { DuplicateAssetError, createRepoAsset, createServerAsset } from "./store";
import type { ServerAuthType } from "./types";

export type ImportRowResult =
  | { row: number; ok: true; assetId: string }
  | { row: number; ok: false; reason: string };

interface RepoRow { display_name?: unknown; repo_url?: unknown }
interface ServerRow {
  display_name?: unknown; host_ip?: unknown; hostname?: unknown; ssh_port?: unknown;
  auth_type?: unknown; username?: unknown; secret?: unknown;
}

function importRepoSheet(rows: RepoRow[], projectId: string | null, db: Database): ImportRowResult[] {
  return rows.map((raw, index) => {
    const rowNumber = index + 2; // 헤더가 1행이므로 데이터는 2행부터
    const displayName = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
    const repoUrl = typeof raw.repo_url === "string" ? raw.repo_url.trim() : "";
    if (!displayName || !repoUrl) {
      return { row: rowNumber, ok: false, reason: "display_name과 repo_url은 필수입니다" };
    }
    try {
      const asset = createRepoAsset({ displayName, repoUrl, projectId }, db);
      return { row: rowNumber, ok: true, assetId: asset.id };
    } catch (error) {
      if (error instanceof DuplicateAssetError) return { row: rowNumber, ok: false, reason: error.message };
      throw error;
    }
  });
}

const VALID_AUTH_TYPES: ServerAuthType[] = ["password", "key"];

function importServerSheet(rows: ServerRow[], projectId: string | null, db: Database): ImportRowResult[] {
  return rows.map((raw, index) => {
    const rowNumber = index + 2;
    const displayName = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
    const hostIp = typeof raw.host_ip === "string" ? raw.host_ip.trim() : "";
    const hostname = typeof raw.hostname === "string" ? raw.hostname.trim() : "";
    const sshPort = Number(raw.ssh_port);
    const authType = raw.auth_type as ServerAuthType;
    const username = typeof raw.username === "string" ? raw.username.trim() : "";
    const secret = typeof raw.secret === "string" ? raw.secret : "";

    if (!displayName || !hostIp || !hostname || !username || !secret) {
      return { row: rowNumber, ok: false, reason: "필수 컬럼이 비어 있습니다" };
    }
    if (!Number.isInteger(sshPort) || sshPort <= 0) {
      return { row: rowNumber, ok: false, reason: "ssh_port가 올바르지 않습니다" };
    }
    if (!VALID_AUTH_TYPES.includes(authType)) {
      return { row: rowNumber, ok: false, reason: "auth_type은 password 또는 key여야 합니다" };
    }

    try {
      const asset = createServerAsset({ displayName, hostIp, hostname, sshPort, authType, username, secret, projectId }, db);
      return { row: rowNumber, ok: true, assetId: asset.id };
    } catch (error) {
      if (error instanceof DuplicateAssetError) return { row: rowNumber, ok: false, reason: error.message };
      throw error;
    }
  });
}

export function importAssetsFromWorkbook(
  buffer: Buffer,
  projectId: string | null,
  db: Database = getDb(),
): { repo: ImportRowResult[]; server: ImportRowResult[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const repoSheet = workbook.Sheets["repo"];
  const serverSheet = workbook.Sheets["server"];
  return {
    repo: repoSheet ? importRepoSheet(XLSX.utils.sheet_to_json<RepoRow>(repoSheet), projectId, db) : [],
    server: serverSheet ? importServerSheet(XLSX.utils.sheet_to_json<ServerRow>(serverSheet), projectId, db) : [],
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/assets/excelImport.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json src/lib/assets/excelImport.ts src/lib/assets/excelImport.test.ts
git commit -m "feat: 자산 엑셀 일괄 업로드 파서 추가 (repo/server 시트, 행 단위 결과)"
```

---

### Task 8: `Run` 타입에 `assetId` 추가 (Task 14에서 옮겨 온 선행 작업)

**Files:**
- Modify: `src/lib/pipeline/runs.ts`
- Test: `src/lib/pipeline/runs.test.ts` (있으면 갱신, 없으면 스킵)

**Interfaces:**
- Produces: `Run` 인터페이스에 `assetId: string | null`, `createRun(source, sourceType, assetId?, db?): Run` 시그니처

> 이 작업을 Task 5~7의 store/API보다 먼저 하지 않은 이유: store 테스트는 `createRun`을 직접 부르지만 `asset_id`는 SQL로 직접 UPDATE하므로 타입 변경 없이도 통과한다. 다만 Task 8~13의 API/UI가 `run.assetId`를 읽으므로, 그 이전에 이 작업을 반드시 완료해야 한다.

- [ ] **Step 1: 실제 파일 확인**

`src/lib/pipeline/runs.ts`를 Read로 열어 `Run` 인터페이스, `toRun()` 매퍼, `createRun()` 시그니처와 INSERT 문을 확인한다.

- [ ] **Step 2: `assetId` 추가**

기존 필드들과 동일한 snake_case↔camelCase 매핑 방식으로 추가한다:

```ts
// Run 인터페이스에 추가
assetId: string | null;

// toRun()에 추가 (RunRow에도 asset_id: string | null 추가)
assetId: row.asset_id,

// createRun() — assetId 인자 추가 (db 인자 앞에 삽입)
export function createRun(
  source: string,
  sourceType: RunSourceType = "git",
  assetId: string | null = null,
  db: Database = getDb(),
): Run {
  // INSERT 문 컬럼 목록에 asset_id 추가, 바인딩 객체에 asset_id: assetId 추가
}
```

- [ ] **Step 3: 기존 `createRun` 호출부 수정**

`grep -rn "createRun(" src` 로 기존 호출부를 찾아, 인자 추가로 깨진 곳을 `createRun(x, "git", null)` 형태로 갱신한다. Task 5의 store 테스트에 있던 `createRun(asset.repoUrl!, "git", db)`도 `createRun(asset.repoUrl!, "git", null, db)`로 갱신한다.

- [ ] **Step 4: 타입 체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 없음, 기존 테스트 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/pipeline/runs.ts
git commit -m "feat: Run 모델에 assetId 필드 추가"
```

---

### Task 9: API — `/api/assets`, `/api/assets/[id]`

**Files:**
- Create: `src/app/api/assets/route.ts`
- Create: `src/app/api/assets/[id]/route.ts`

**Interfaces:**
- Consumes: `listAssets`, `createRepoAsset`, `createServerAsset`, `getAsset`, `deleteAsset`, `DuplicateAssetError`, `AssetInUseError` (`@/lib/assets/store`), `listRuns` (`@/lib/pipeline/runs`)

- [ ] **Step 1: 라우트 구현** (라우팅 글루 코드 — 기존 코드베이스 관례상 API route에는 유닛테스트가 없고 store 테스트로 커버됨)

```ts
// src/app/api/assets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { DuplicateAssetError, createRepoAsset, createServerAsset, listAssets } from "@/lib/assets/store";

export function GET(req: NextRequest) {
  const projectIdParam = req.nextUrl.searchParams.get("projectId");
  const typeParam = req.nextUrl.searchParams.get("type");
  const filter: Parameters<typeof listAssets>[0] = {};
  if (projectIdParam !== null) {
    filter.projectId = projectIdParam === "unassigned" ? null : projectIdParam;
  }
  if (typeParam === "repo" || typeParam === "server") {
    filter.type = typeParam;
  }
  return NextResponse.json({ assets: listAssets(filter) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const type = body?.type;
  try {
    if (type === "repo") {
      const asset = createRepoAsset({
        displayName: String(body.displayName ?? ""),
        repoUrl: String(body.repoUrl ?? ""),
        projectId: body.projectId || null,
      });
      return NextResponse.json({ asset }, { status: 201 });
    }
    if (type === "server") {
      const asset = createServerAsset({
        displayName: String(body.displayName ?? ""),
        hostIp: String(body.hostIp ?? ""),
        hostname: String(body.hostname ?? ""),
        sshPort: Number(body.sshPort),
        authType: body.authType,
        username: String(body.username ?? ""),
        secret: String(body.secret ?? ""),
        projectId: body.projectId || null,
      });
      return NextResponse.json({ asset }, { status: 201 });
    }
    return NextResponse.json({ error: "type은 repo 또는 server여야 합니다" }, { status: 400 });
  } catch (error) {
    if (error instanceof DuplicateAssetError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
```

```ts
// src/app/api/assets/[id]/route.ts
import { NextResponse } from "next/server";
import { AssetInUseError, deleteAsset, getAsset } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
  const runs = listRuns().filter((run) => run.assetId === id);
  return NextResponse.json({ asset, runs });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetInUseError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
```

- [ ] **Step 2: 수동 확인**

Run: `npm run dev` 후 `curl -X POST localhost:3000/api/assets -H 'Content-Type: application/json' -d '{"type":"repo","displayName":"test","repoUrl":"https://github.com/x/y"}'`
Expected: `201`과 함께 생성된 asset JSON. 같은 URL로 다시 POST하면 `409`.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/assets/
git commit -m "feat: 자산 등록/조회/삭제 API 라우트 추가"
```

---

### Task 10: API — 엑셀 업로드 `/api/assets/upload`

**Files:**
- Create: `src/app/api/assets/upload/route.ts`

**Interfaces:**
- Consumes: `importAssetsFromWorkbook` (`@/lib/assets/excelImport`)

- [ ] **Step 1: 라우트 구현**

```ts
// src/app/api/assets/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { importAssetsFromWorkbook } from "@/lib/assets/excelImport";

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다" }, { status: 400 });
  }
  const projectIdField = formData?.get("projectId");
  const projectId = typeof projectIdField === "string" && projectIdField ? projectIdField : null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = importAssetsFromWorkbook(buffer, projectId);
  return NextResponse.json(result);
}
```

- [ ] **Step 2: 수동 확인**

Run: 템플릿 엑셀로 `curl -X POST localhost:3000/api/assets/upload -F file=@repo-template.xlsx`
Expected: `{ repo: [...], server: [] }` 형태 응답

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/assets/upload/
git commit -m "feat: 자산 엑셀 일괄 업로드 API 라우트 추가"
```

---

### Task 11: API — 프로젝트 CRUD + 공유링크 재발급/검증

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`
- Create: `src/app/api/projects/[id]/share/route.ts`
- Create: `src/app/api/share/[token]/route.ts`

**Interfaces:**
- Consumes: `createProject`, `listProjects`, `getProject`, `updateProject`, `deleteProject`, `regenerateShareLink`, `verifyShareAccess` (`@/lib/projects/store`), `listAssets` (`@/lib/assets/store`), `listRuns` (`@/lib/pipeline/runs`)

- [ ] **Step 1: 라우트 구현**

```ts
// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects/store";

export function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const pmName = typeof body?.pmName === "string" ? body.pmName.trim() : "";
  const pmEmail = typeof body?.pmEmail === "string" ? body.pmEmail.trim() : "";
  const sharePassword = typeof body?.sharePassword === "string" ? body.sharePassword : "";
  if (!name || !pmName || !pmEmail || !sharePassword) {
    return NextResponse.json({ error: "name, pmName, pmEmail, sharePassword는 필수입니다" }, { status: 400 });
  }
  const project = createProject({ name, pmName, pmEmail, sharePassword });
  return NextResponse.json({ project }, { status: 201 });
}
```

```ts
// src/app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteProject, getProject, updateProject } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
  return NextResponse.json({ project, assets: listAssets({ projectId: id }) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const project = updateProject(id, {
    name: typeof body?.name === "string" ? body.name : undefined,
    pmName: typeof body?.pmName === "string" ? body.pmName : undefined,
    pmEmail: typeof body?.pmEmail === "string" ? body.pmEmail : undefined,
  });
  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteProject(id);
  return NextResponse.json({ ok: true });
}
```

```ts
// src/app/api/projects/[id]/share/route.ts
import { NextRequest, NextResponse } from "next/server";
import { regenerateShareLink } from "@/lib/projects/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const newPassword = typeof body?.password === "string" ? body.password : "";
  if (!newPassword) return NextResponse.json({ error: "password는 필수입니다" }, { status: 400 });
  return NextResponse.json(regenerateShareLink(id, newPassword));
}
```

```ts
// src/app/api/share/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyShareAccess } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const result = verifyShareAccess(token, password);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "locked" ? 423 : 401;
    return NextResponse.json({ error: result.reason }, { status });
  }

  const assets = listAssets({ projectId: result.project.id });
  const assetIds = new Set(assets.map((asset) => asset.id));
  const runs = listRuns().filter((run) => run.assetId && assetIds.has(run.assetId));
  return NextResponse.json({ project: result.project, assets, runs });
}
```

- [ ] **Step 2: 수동 확인**

Run: `curl -X POST localhost:3000/api/projects -H 'Content-Type: application/json' -d '{"name":"프로젝트A","pmName":"김PM","pmEmail":"pm@nh.com","sharePassword":"pw123"}'`
Expected: `201` + `shareToken` 포함. 그 토큰으로 `/api/share/[token]` POST 시 자산/run 목록 반환.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/projects/ src/app/api/share/
git commit -m "feat: 프로젝트 CRUD 및 PM 공유링크 API 라우트 추가"
```

---

### Task 12: UI — 자산 목록/등록/업로드/상세 화면

**Files:**
- Create: `src/app/assets/page.tsx`, `src/app/assets/AssetFilters.tsx`
- Create: `src/app/assets/new/page.tsx`, `src/app/assets/new/AssetForm.tsx`
- Create: `src/app/assets/upload/page.tsx`, `src/app/assets/upload/UploadForm.tsx`
- Create: `src/app/assets/[id]/page.tsx`

**Interfaces:**
- Consumes: `listAssets`, `getAsset` (`@/lib/assets/store`), `listProjects` (`@/lib/projects/store`), `listRuns` (`@/lib/pipeline/runs`), `Project` (`@/lib/projects/types`), `ImportRowResult` (`@/lib/assets/excelImport`)

- [ ] **Step 1: 목록 페이지 + 필터**

```tsx
// src/app/assets/page.tsx
import Link from "next/link";
import { listAssets } from "@/lib/assets/store";
import { listProjects } from "@/lib/projects/store";
import { AssetFilters } from "./AssetFilters";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; type?: string }>;
}) {
  const { projectId, type } = await searchParams;
  const filter: Parameters<typeof listAssets>[0] = {};
  if (projectId) filter.projectId = projectId === "unassigned" ? null : projectId;
  if (type === "repo" || type === "server") filter.type = type;

  const assets = listAssets(filter);
  const projects = listProjects();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">자산 관리</h1>
        <div className="flex gap-2">
          <Link href="/assets/upload" className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-3 py-1.5 text-sm">엑셀 업로드</Link>
          <Link href="/assets/new" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white">자산 등록</Link>
        </div>
      </div>

      <AssetFilters projects={projects} />

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
            <th className="py-2">이름</th><th className="py-2">타입</th><th className="py-2">프로젝트</th><th className="py-2">등록일</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const project = projects.find((p) => p.id === asset.projectId);
            return (
              <tr key={asset.id} className="border-b border-[var(--color-border)]">
                <td className="py-2"><Link href={`/assets/${asset.id}`} className="text-[var(--color-primary)]">{asset.displayName}</Link></td>
                <td className="py-2">{asset.type === "repo" ? "레포" : "서버"}</td>
                <td className="py-2">{project?.name ?? "미분류"}</td>
                <td className="py-2 font-mono text-xs text-[var(--color-muted)]">{asset.createdAt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
```

```tsx
// src/app/assets/AssetFilters.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Project } from "@/lib/projects/types";

export function AssetFilters({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/assets?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex gap-3 text-sm">
      <select defaultValue={searchParams.get("projectId") ?? ""} onChange={(e) => updateParam("projectId", e.target.value)}
        className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1">
        <option value="">전체 프로젝트</option>
        <option value="unassigned">미분류</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <select defaultValue={searchParams.get("type") ?? ""} onChange={(e) => updateParam("type", e.target.value)}
        className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1">
        <option value="">전체 타입</option>
        <option value="repo">레포</option>
        <option value="server">서버</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 2: 등록 폼** (레포/서버 타입 전환, 서버는 인증방식 선택 후 자격증명 입력)

```tsx
// src/app/assets/new/page.tsx
import { listProjects } from "@/lib/projects/store";
import { AssetForm } from "./AssetForm";

export default async function NewAssetPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-lg font-bold text-[var(--color-text)]">자산 등록</h1>
      <AssetForm projects={listProjects()} />
    </main>
  );
}
```

```tsx
// src/app/assets/new/AssetForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/projects/types";

const inputClass = "rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1";

export function AssetForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [type, setType] = useState<"repo" | "server">("repo");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, type }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "등록에 실패했습니다");
      return;
    }
    router.push("/assets");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
      <div className="flex gap-2">
        {(["repo", "server"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`rounded-[var(--radius-nh)] border px-3 py-1.5 ${type === t ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
            {t === "repo" ? "레포" : "서버"}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">이름<input name="displayName" required className={inputClass} /></label>

      {type === "repo" ? (
        <label className="flex flex-col gap-1">레포 URL<input name="repoUrl" required className={inputClass} /></label>
      ) : (
        <>
          <label className="flex flex-col gap-1">호스트 IP<input name="hostIp" required className={inputClass} /></label>
          <label className="flex flex-col gap-1">호스트명<input name="hostname" required className={inputClass} /></label>
          <label className="flex flex-col gap-1">SSH 포트<input name="sshPort" type="number" defaultValue={22} required className={inputClass} /></label>
          <label className="flex flex-col gap-1">인증 방식
            <select name="authType" className={inputClass}>
              <option value="password">비밀번호</option>
              <option value="key">SSH 키</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">사용자명<input name="username" required className={inputClass} /></label>
          <label className="flex flex-col gap-1">비밀번호 또는 SSH 키 내용<textarea name="secret" required className={inputClass} /></label>
        </>
      )}

      <label className="flex flex-col gap-1">프로젝트 (선택)
        <select name="projectId" className={inputClass}>
          <option value="">미분류</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>

      {error && <p className="text-[var(--color-fail)]">{error}</p>}
      <button type="submit" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white">등록</button>
    </form>
  );
}
```

- [ ] **Step 3: 엑셀 업로드 화면**

```tsx
// src/app/assets/upload/page.tsx
import { listProjects } from "@/lib/projects/store";
import { UploadForm } from "./UploadForm";

export default async function UploadAssetsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-lg font-bold text-[var(--color-text)]">자산 엑셀 일괄 업로드</h1>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        시트 이름은 <code>repo</code>, <code>server</code>여야 합니다. repo: display_name, repo_url.
        server: display_name, host_ip, hostname, ssh_port, auth_type, username, secret.
      </p>
      <UploadForm projects={listProjects()} />
    </main>
  );
}
```

```tsx
// src/app/assets/upload/UploadForm.tsx
"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects/types";
import type { ImportRowResult } from "@/lib/assets/excelImport";

export function UploadForm({ projects }: { projects: Project[] }) {
  const [result, setResult] = useState<{ repo: ImportRowResult[]; server: ImportRowResult[] } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await fetch("/api/assets/upload", { method: "POST", body: new FormData(e.currentTarget) });
    setResult(await res.json());
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <select name="projectId" className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1">
          <option value="">미분류</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <input type="file" name="file" accept=".xlsx" required />
        <button type="submit" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white">업로드</button>
      </form>

      {result && (
        <div className="flex flex-col gap-2">
          {(["repo", "server"] as const).map((key) => (
            <div key={key}>
              <p className="font-bold">{key === "repo" ? "레포" : "서버"} 결과</p>
              <ul>
                {result[key].map((row) => (
                  <li key={row.row} className={row.ok ? "text-[var(--color-pass)]" : "text-[var(--color-fail)]"}>
                    {row.row}행: {row.ok ? "성공" : row.reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 자산 상세 (점검 이력)**

```tsx
// src/app/assets/[id]/page.tsx
import { notFound } from "next/navigation";
import { getAsset } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) notFound();

  const runs = listRuns().filter((run) => run.assetId === id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-lg font-bold text-[var(--color-text)]">{asset.displayName}</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        {asset.type === "repo" ? asset.repoUrl : `${asset.hostIp}:${asset.sshPort}`}
      </p>
      <h2 className="mb-2 text-sm font-bold">점검 이력</h2>
      <ul className="text-sm">
        {runs.map((run) => (
          <li key={run.id} className="border-b border-[var(--color-border)] py-2">{run.createdAt} — {run.status}</li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: 수동 확인**

`npm run dev` → `/assets` → `/assets/new`로 레포/서버 등록 → 목록에서 필터링 → `/assets/upload`로 엑셀 업로드 → `/assets/[id]` 상세 진입 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/app/assets/
git commit -m "feat: 자산 목록/등록/업로드/상세 화면 추가"
```

---

### Task 13: UI — 프로젝트 관리 + PM 공유 뷰

**Files:**
- Create: `src/app/projects/page.tsx`, `src/app/projects/ProjectForm.tsx`
- Create: `src/app/projects/[id]/page.tsx`, `src/app/projects/[id]/ShareLinkPanel.tsx`
- Create: `src/app/share/[token]/page.tsx`, `src/app/share/[token]/ShareGate.tsx`

**Interfaces:**
- Consumes: `listProjects`, `getProject` (`@/lib/projects/store`), `listAssets` (`@/lib/assets/store`)

- [ ] **Step 1: 프로젝트 목록 + 생성 폼**

```tsx
// src/app/projects/page.tsx
import Link from "next/link";
import { listProjects } from "@/lib/projects/store";
import { ProjectForm } from "./ProjectForm";

export default async function ProjectsPage() {
  const projects = listProjects();
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-lg font-bold text-[var(--color-text)]">프로젝트</h1>
      <ProjectForm />
      <ul className="mt-6 text-sm">
        {projects.map((project) => (
          <li key={project.id} className="border-b border-[var(--color-border)] py-2">
            <Link href={`/projects/${project.id}`} className="text-[var(--color-primary)]">{project.name}</Link>
            <span className="ml-2 text-[var(--color-muted)]">{project.pmName} · {project.pmEmail}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

```tsx
// src/app/projects/ProjectForm.tsx
"use client";

import { useRouter } from "next/navigation";

const inputClass = "rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1";

export function ProjectForm() {
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 text-sm">
      <input name="name" placeholder="프로젝트명" required className={inputClass} />
      <input name="pmName" placeholder="PM 이름" required className={inputClass} />
      <input name="pmEmail" type="email" placeholder="PM 이메일" required className={inputClass} />
      <input name="sharePassword" placeholder="공유링크 비밀번호" required className={inputClass} />
      <button type="submit" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white">프로젝트 생성</button>
    </form>
  );
}
```

- [ ] **Step 2: 프로젝트 상세 + 공유링크 패널**

```tsx
// src/app/projects/[id]/page.tsx
import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { ShareLinkPanel } from "./ShareLinkPanel";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const assets = listAssets({ projectId: id });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-lg font-bold text-[var(--color-text)]">{project.name}</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">{project.pmName} · {project.pmEmail}</p>
      <ShareLinkPanel projectId={project.id} shareToken={project.shareToken} />
      <h2 className="mt-8 mb-2 text-sm font-bold">소속 자산 ({assets.length})</h2>
      <ul className="text-sm">
        {assets.map((asset) => (
          <li key={asset.id} className="border-b border-[var(--color-border)] py-2">
            {asset.displayName} ({asset.type === "repo" ? "레포" : "서버"})
          </li>
        ))}
      </ul>
    </main>
  );
}
```

```tsx
// src/app/projects/[id]/ShareLinkPanel.tsx
"use client";

import { useState } from "react";

export function ShareLinkPanel({ projectId, shareToken }: { projectId: string; shareToken: string }) {
  const [token, setToken] = useState(shareToken);
  const [newPassword, setNewPassword] = useState("");

  async function handleRegenerate() {
    const res = await fetch(`/api/projects/${projectId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setToken((await res.json()).shareToken);
      setNewPassword("");
    }
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";

  return (
    <div className="rounded-[var(--radius-nh)] border border-[var(--color-border)] p-4 text-sm">
      <p className="mb-2 font-bold">PM 공유 링크</p>
      <p className="mb-3 font-mono text-xs text-[var(--color-muted)]">{shareUrl}</p>
      <div className="flex gap-2">
        <input type="password" placeholder="새 비밀번호" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1" />
        <button onClick={handleRegenerate} className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-3 py-1.5">링크/비밀번호 재발급</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: PM 공유 뷰 (비밀번호 게이트)**

```tsx
// src/app/share/[token]/page.tsx
import { ShareGate } from "./ShareGate";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <ShareGate token={token} />
    </main>
  );
}
```

```tsx
// src/app/share/[token]/ShareGate.tsx
"use client";

import { useState } from "react";

interface ShareData {
  project: { name: string; pmName: string };
  assets: { id: string; displayName: string; type: "repo" | "server" }[];
  runs: { id: string; status: string; createdAt: string; assetId: string | null }[];
}

export function ShareGate({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/share/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "locked" ? "5회 실패로 잠겼습니다. 15분 후 다시 시도하세요" : "비밀번호가 올바르지 않습니다");
      return;
    }
    setData(await res.json());
  }

  if (data) {
    return (
      <div className="text-sm">
        <h1 className="mb-2 text-lg font-bold text-[var(--color-text)]">{data.project.name}</h1>
        <p className="mb-6 text-[var(--color-muted)]">담당 PM: {data.project.pmName}</p>
        <h2 className="mb-2 font-bold">자산 ({data.assets.length})</h2>
        <ul className="mb-6">{data.assets.map((asset) => <li key={asset.id}>{asset.displayName}</li>)}</ul>
        <h2 className="mb-2 font-bold">점검 이력 ({data.runs.length})</h2>
        <ul>{data.runs.map((run) => <li key={run.id}>{run.createdAt} — {run.status}</li>)}</ul>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
      <p className="text-[var(--color-muted)]">이 프로젝트의 점검 결과를 보려면 비밀번호를 입력하세요.</p>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
        className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1" />
      {error && <p className="text-[var(--color-fail)]">{error}</p>}
      <button type="submit" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white">확인</button>
    </form>
  );
}
```

- [ ] **Step 4: 수동 확인**

`/projects`에서 프로젝트 생성 → 상세 진입 → 공유링크 확인/재발급 → 복사한 링크로 `/share/[token]` 접속 → 틀린 비번 5회 → 잠금 메시지 → (테스트를 위해 DB에서 `share_locked_until` 제거) → 올바른 비번으로 자산/이력 노출 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/projects/ src/app/share/
git commit -m "feat: 프로젝트 관리 화면과 PM 공유링크 읽기전용 뷰 추가"
```

---

### Task 14: `/runs` 플로우를 "자산 선택" 방식으로 전환

**Files:**
- Modify: `src/app/api/runs/route.ts`
- Modify: `src/app/runs/` 아래 URL 직접입력 폼 컴포넌트 (파일명은 실행 시점에 `grep`으로 확인)

**Interfaces:**
- Consumes: `getAsset`, `listAssets` (`@/lib/assets/store`), `createRun` (`@/lib/pipeline/runs`, Task 8에서 `assetId` 인자 이미 추가됨)

- [ ] **Step 1: `POST /api/runs`를 자산 선택 기반으로 변경**

`src/app/api/runs/route.ts`의 `POST`를 아래로 교체한다. GET 핸들러와 `imageTag`(local_image) 분기는 유지하되, `repoUrl` 직접입력 분기는 제거하고 자산 선택으로 대체한다:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/pipeline/runs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { getAsset } from "@/lib/assets/store";
import { listLocalImages } from "@/lib/pipeline/localImages";

export function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // 로컬 이미지 분기는 기존 로직 유지
  const imageTag = typeof body?.imageTag === "string" ? body.imageTag.trim() : "";
  if (imageTag) {
    const localImages = await listLocalImages().catch(() => []);
    if (!localImages.some((image) => image.tag === imageTag)) {
      return NextResponse.json({ error: "로컬에 존재하지 않는 이미지입니다" }, { status: 400 });
    }
    const run = createRun(imageTag, "local_image", null);
    void runPipeline(run.id, { type: "local_image", imageTag });
    return NextResponse.json({ run }, { status: 202 });
  }

  // 레포 URL 직접입력 대신 등록된 자산 선택
  const assetId = typeof body?.assetId === "string" ? body.assetId : "";
  const asset = getAsset(assetId);
  if (!asset) {
    return NextResponse.json({ error: "유효한 자산을 선택하세요" }, { status: 400 });
  }
  if (asset.type === "server") {
    return NextResponse.json({ error: "서버 자산 점검 실행은 아직 지원되지 않습니다 (A2에서 제공 예정)" }, { status: 501 });
  }

  const run = createRun(asset.repoUrl!, "git", asset.id);
  void runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! });
  return NextResponse.json({ run }, { status: 202 });
}
```

> 위 코드의 `listLocalImages` import 경로/이름은 기존 파일에 있던 것을 그대로 옮긴 것이다. 실제 파일을 열어 기존 import와 일치하는지 확인하고, 다르면 기존 것에 맞춘다.

- [ ] **Step 2: 자산 선택 UI로 교체**

`grep -rl "repoUrl" src/app/runs` 로 URL 입력 폼 컴포넌트를 찾는다. `<input name="repoUrl">`를 자산 선택 드롭다운으로 교체한다:

```tsx
<select name="assetId" required className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1">
  <option value="">자산을 선택하세요</option>
  {assets.map((asset) => (
    <option key={asset.id} value={asset.id} disabled={asset.type === "server"}>
      {asset.displayName}{asset.type === "server" ? " (서버 점검은 곧 제공됩니다)" : ""}
    </option>
  ))}
</select>
```

제출 시 fetch body를 `{ repoUrl }` 대신 `{ assetId }`로 변경한다. 자산 목록은 폼이 서버 컴포넌트면 `listAssets()`를 직접 호출해 props로 내려주고, 클라이언트 컴포넌트면 부모 서버 컴포넌트(`src/app/runs/page.tsx`)에서 조회해 props로 전달한다.

- [ ] **Step 3: 수동 확인**

`/assets/new`에서 레포·서버 자산 각각 등록 → `/runs`에서 드롭다운에 둘 다 보이되 서버는 disabled 확인 → 레포 자산 선택 후 점검 시작 → 기존 파이프라인이 정상 동작하는지 확인 → 완료 후 `/assets/[id]` 상세에서 방금 run이 이력에 연결됐는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/runs/route.ts src/app/runs/
git commit -m "feat: /runs를 등록된 자산 선택 기반으로 전환"
```

---

## Self-Review 메모

- **스펙 커버리지**: 데이터 모델(Task 1,5,6,8) · UI/플로우(Task 12,13,14) · 엑셀 포맷(Task 7,10) · 엣지케이스(dedupe: Task 4,5 / 공유링크 잠금: Task 6 / 프로젝트 삭제 시 자산 미분류 이동: Task 6 / 자산 삭제 시 진행 중 run 차단 및 cascade: Task 5) · 테스트 전략(각 store/util Task의 단위 테스트) 모두 태스크로 매핑됨.
- **태스크 순서 의존성**: Task 8(`Run.assetId` 추가)을 API/UI(Task 9~14)보다 먼저 두었다. store 테스트(Task 5)는 SQL로 직접 `asset_id`를 UPDATE하므로 Task 8 이전에도 통과하지만, Task 8 완료 후 store 테스트의 `createRun` 호출 인자를 갱신해야 한다(Task 8 Step 3에 명시).
- **엑셀 헤더 불일치 검증**: 스펙의 "헤더가 템플릿과 다르면 업로드 차단" 요구사항은 Task 7에서 행 단위 필수값 누락 처리로 커버(헤더가 다르면 모든 행이 실패로 보고됨)했다. 사전 헤더 차단이 필요하면 후속 태스크로 추가한다.
- **미확정 사항**: Task 14의 `/runs` 폼 컴포넌트 파일명과 `listLocalImages` import 경로는 조사 시점 스냅샷 기준이라 실행자가 실제 파일을 열어 확인하도록 구체적 방법(grep)과 대체 코드를 함께 제공했다.
