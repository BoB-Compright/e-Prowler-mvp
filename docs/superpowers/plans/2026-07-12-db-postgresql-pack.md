# DB — PostgreSQL 벤더 팩 (#3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** CIS PostgreSQL Benchmark 기준 `db-postgresql` 팩(PG-01~12)을 추가하고, DB 카탈로그의 벤더 항목을 프리픽스로 분리한다.

**Architecture:** `db.json`에 PG-01~12 추가. `src/lib/packs/dbPostgres.ts`가 postgresql.conf/pg_hba.conf/파일권한/프로세스 증거·`getPgState`·파서·12 평가기·pack. **DB 카탈로그에 DB-*(MySQL)와 PG-*(PostgreSQL)가 공존하므로 각 DB 팩 itemIds를 id 프리픽스로 필터**(db-mysql=DB-*, db-postgresql=PG-*). `registry.ts` 등록.

**Tech Stack:** TypeScript, better-sqlite3, vitest, Ansible(raw over ssh).

## Global Constraints

- Node 24 테스트: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- 게이트: `npx tsc --noEmit` && `npx eslint <touched>` && vitest.
- 출처 CIS 대등, 불확실 항목 `(항목 확인 필요)`.
- review 최소화: PG-11(SQL)·PG-12(버전)만 review.
- 평가기는 `AnsibleTaskOutput[]`만 받는 순수 함수. 증거 `name` 유일, `raw` 셸 유효 + `; true`(`sh -n` 검증).
- **벤더 분리:** 각 DB 팩 itemIds는 자기 프리픽스만(DB-* / PG-*). evaluate 결과 개수 = itemIds 개수.

---

## Task 1: PG 카탈로그 추가 + DB 팩 벤더 프리픽스 분리

**Files:** Modify `src/lib/catalog/data/cis/db.json`, `src/lib/packs/dbMysql.ts`, Test `src/lib/catalog/index.test.ts`, `src/lib/packs/dbMysql.test.ts`

**Interfaces:** Produces DB 카탈로그 24항목(DB-*12+PG-*12). `dbMysqlPack.itemIds`가 DB-*만.

- [ ] **Step 1: 실패 테스트** — `index.test.ts`에 추가:

```ts
it("db category now has 24 items: DB-* (MySQL) + PG-* (PostgreSQL)", () => {
  const ids = getCatalogByCategory("db").map((i) => i.id);
  expect(ids.filter((i) => i.startsWith("DB-"))).toHaveLength(12);
  expect(ids.filter((i) => i.startsWith("PG-"))).toHaveLength(12);
  expect(ids).toContain("PG-01");
  expect(ids).toContain("PG-12");
});
```
  `dbMysql.test.ts`의 pack shape 테스트를 프리픽스 기준으로 갱신:
```ts
it("dbMysqlPack itemIds are DB-* only (not PG-*)", () => {
  expect(dbMysqlPack.itemIds.every((id) => id.startsWith("DB-"))).toBe(true);
  expect(dbMysqlPack.itemIds).toHaveLength(12);
  const present = [{ taskName: "mysql detection (internal)", stdout: "present" }];
  expect(dbMysqlPack.evaluate({ findings: null, tasks: present }).map((r) => r.id).sort())
    .toEqual(dbMysqlPack.itemIds.slice().sort());
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/catalog src/lib/packs/dbMysql.test.ts` → FAIL.

- [ ] **Step 3: PG 항목 추가** — `src/lib/catalog/data/cis/db.json`의 배열 끝(DB-12 뒤)에 PG-01~12 추가:

```json
  ,{ "id": "PG-01", "title": "데이터 디렉터리 접근 권한 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - data directory permissions (항목 확인 필요)" } },
  { "id": "PG-02", "title": "전용 비특권 계정으로 구동", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - dedicated OS account (항목 확인 필요)" } },
  { "id": "PG-03", "title": "설정 파일 권한 제한", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - config file permissions (항목 확인 필요)" } },
  { "id": "PG-04", "title": "로깅 수집 활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - logging_collector (항목 확인 필요)" } },
  { "id": "PG-05", "title": "네트워크 노출 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - listen_addresses (항목 확인 필요)" } },
  { "id": "PG-06", "title": "SSL/TLS 활성화", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - ssl on (항목 확인 필요)" } },
  { "id": "PG-07", "title": "pg_hba 신뢰(trust) 인증 금지", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - pg_hba trust auth (항목 확인 필요)" } },
  { "id": "PG-08", "title": "안전한 비밀번호 암호화(scram-sha-256)", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - password_encryption (항목 확인 필요)" } },
  { "id": "PG-09", "title": "접속 로깅(log_connections)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - log_connections (항목 확인 필요)" } },
  { "id": "PG-10", "title": "접속 종료 로깅(log_disconnections)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - log_disconnections (항목 확인 필요)" } },
  { "id": "PG-11", "title": "슈퍼유저/과다 권한 역할 관리", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - superuser/roles (항목 확인 필요)" } },
  { "id": "PG-12", "title": "주기적 보안 패치 및 버전 관리", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "PostgreSQL Benchmark - patch/version (항목 확인 필요)" } }
```
  (기존 마지막 `}` 뒤에 `,`로 이어 붙이고 배열 닫기 `]` 유지.) 카탈로그 총계 테스트가 있으면 126→138.

- [ ] **Step 4: db-mysql itemIds 프리픽스 필터** — `src/lib/packs/dbMysql.ts`의 `dbMysqlPack.itemIds`를:
```ts
  itemIds: getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith("DB-")),
```

- [ ] **Step 5: 통과 + 전체 스위트** — `npx vitest run` → PASS(db-mysql 12개 유지 확인).

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/catalog/data/cis/db.json src/lib/packs/dbMysql.ts src/lib/catalog/index.test.ts src/lib/packs/dbMysql.test.ts
git commit -m "feat: PG 카탈로그 12항목 추가 + db-mysql itemIds를 DB-* 프리픽스로 분리 (#db-postgresql)"
```

---

## Task 2: PostgreSQL 증거 + 상태 헬퍼 + 파서

**Files:** Create `src/lib/packs/dbPostgres.ts`(부분), Test `src/lib/packs/dbPostgres.test.ts`(부분)

**Interfaces:** Produces `PG_EVIDENCE: PlaybookTask[]`(7); `getPgState(tasks): { present, conf, hba, datadirPerms, confPerms, processLine, version }`; `pgValue(conf, key): string | null`(postgresql.conf key=value, 마지막 매칭, 따옴표·인라인#주석 제거, 키 소문자); `pgBool(conf, key): boolean`(값이 on/true/1); `noGroupOtherAccess`/`noOtherWrite`(재사용 목적 로컬 정의).

- [ ] **Step 1: 실패 테스트** — `dbPostgres.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PG_EVIDENCE, getPgState, pgValue, pgBool } from "./dbPostgres";

const present = [
  { taskName: "postgres detection (internal)", stdout: "present\n" },
  { taskName: "postgresql.conf (internal)", stdout: "listen_addresses = 'localhost'\nssl = on\n#ssl = off\nport = 5432 # inline\n" },
];

describe("postgres evidence + state", () => {
  it("declares 7 unique evidence tasks", () => {
    const names = PG_EVIDENCE.map((t) => t.name);
    expect(names).toContain("postgres detection (internal)");
    expect(names).toContain("postgresql.conf (internal)");
    expect(names).toContain("pg_hba.conf (internal)");
    expect(new Set(names).size).toBe(names.length);
    expect(PG_EVIDENCE.length).toBe(7);
  });
  it("parses values (quotes, inline comment, ignores commented line)", () => {
    const s = getPgState(present);
    expect(s.present).toBe(true);
    expect(pgValue(s.conf, "listen_addresses")).toBe("localhost");
    expect(pgValue(s.conf, "port")).toBe("5432");
    expect(pgBool(s.conf, "ssl")).toBe(true); // 활성 라인 우선, 주석 #ssl=off 무시
  });
  it("absent detection", () => {
    expect(getPgState([{ taskName: "postgres detection (internal)", stdout: "absent" }]).present).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `src/lib/packs/dbPostgres.ts` 상단:

```ts
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";

const MISSING = "__MISSING__";
const CONF_GLOB = "/etc/postgresql/*/main/postgresql.conf /var/lib/pgsql/*/data/postgresql.conf /var/lib/postgresql/*/main/postgresql.conf /var/lib/pgsql/data/postgresql.conf";
const HBA_GLOB = "/etc/postgresql/*/main/pg_hba.conf /var/lib/pgsql/*/data/pg_hba.conf /var/lib/postgresql/*/main/pg_hba.conf /var/lib/pgsql/data/pg_hba.conf";

export const PG_EVIDENCE: PlaybookTask[] = [
  { name: "postgres detection (internal)",
    raw: `sh -c '(command -v postgres >/dev/null 2>&1 || command -v postmaster >/dev/null 2>&1) || ls ${CONF_GLOB} >/dev/null 2>&1 && echo present || echo absent; true'` },
  { name: "postgresql.conf (internal)",
    raw: `sh -c 'found=0; for f in ${CONF_GLOB}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "pg_hba.conf (internal)",
    raw: `sh -c 'found=0; for f in ${HBA_GLOB}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "postgres datadir perms (internal)",
    raw: `sh -c 'D=$(grep -rhiE "^[[:space:]]*data_directory" /etc/postgresql /var/lib/pgsql 2>/dev/null | head -1 | sed "s/.*=//; s/#.*//; s/[[:space:]\\x27]//g"); if [ -z "$D" ]; then for c in /var/lib/postgresql/*/main /var/lib/pgsql/*/data /var/lib/pgsql/data; do [ -d "$c" ] && D="$c" && break; done; fi; if [ -n "$D" ] && [ -d "$D" ]; then stat -c "%U:%G %a" "$D"; else echo ${MISSING}; fi; true'` },
  { name: "postgres conf perms (internal)",
    raw: `sh -c 'for f in ${CONF_GLOB}; do if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; exit 0; fi; done; echo ${MISSING}; true'` },
  { name: "postgres process user (internal)",
    raw: `sh -c 'ps -eo user,args 2>/dev/null | grep -iE "postgres|postmaster" | grep -v grep | head -1; true'` },
  { name: "postgres version (internal)",
    raw: `sh -c 'if command -v postgres >/dev/null 2>&1; then postgres --version 2>&1; elif command -v postmaster >/dev/null 2>&1; then postmaster --version 2>&1; else echo ${MISSING}; fi; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}
function rawOut(tasks: AnsibleTaskOutput[], name: string): string {
  const s = findExact(tasks, name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// postgresql.conf 활성 라인(주석 #, ### 파일구분, 빈 줄 제외; 인라인 # 제거).
function pgActiveLines(conf: string): string[] {
  return conf.split("\n")
    .map((l) => l.replace(/\s+#.*$/, "").replace(/^#.*$/, "").trim())
    .filter((l) => l && !l.startsWith("###") && !l.startsWith("#"));
}

// key = value (postgres는 = 사용). 마지막 매칭 우선(include 순). 따옴표 제거, 키 소문자.
export function pgValue(conf: string, key: string): string | null {
  const want = key.trim().toLowerCase();
  let val: string | null = null;
  for (const line of pgActiveLines(conf)) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1].toLowerCase() === want) {
      val = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return val;
}

export function pgBool(conf: string, key: string): boolean {
  const v = pgValue(conf, key);
  return v !== null && /^(on|true|1|yes)$/i.test(v);
}

export function noGroupOtherAccess(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return g === 0 && o === 0;
}
export function noOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  return (Number(mode.slice(-1)) & 2) === 0;
}

export function getPgState(tasks: AnsibleTaskOutput[]): {
  present: boolean; conf: string; hba: string; datadirPerms: string; confPerms: string; processLine: string; version: string;
} {
  return {
    present: findExact(tasks, "postgres detection (internal)")?.stdout.trim() === "present",
    conf: rawOut(tasks, "postgresql.conf (internal)"),
    hba: rawOut(tasks, "pg_hba.conf (internal)"),
    datadirPerms: rawOut(tasks, "postgres datadir perms (internal)").trim(),
    confPerms: rawOut(tasks, "postgres conf perms (internal)").trim(),
    processLine: (findExact(tasks, "postgres process user (internal)")?.stdout ?? "").trim(),
    version: rawOut(tasks, "postgres version (internal)").trim(),
  };
}
```
  주의: `raw`의 `\\x27`(작은따옴표)·`$D`·`$f`·`$c`는 셸용, `${MISSING}`/`${CONF_GLOB}`/`${HBA_GLOB}`만 TS 보간. `sh -n`으로 7개 검증. (detection의 `||`/`&&` 우선순위: `( A || B ) || ls ... && echo present || echo absent` — ls 성공/실패로 갈리게 괄호 유지.)

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbPostgres.ts src/lib/packs/dbPostgres.test.ts
git commit -m "feat: db-postgresql 증거 태스크 + 상태 헬퍼 + 파서 (#db-postgresql)"
```

---

## Task 3: 평가기 PG-01~06

**Files:** Modify `src/lib/packs/dbPostgres.ts`, `src/lib/packs/dbPostgres.test.ts`

**Interfaces:** Produces `evaluatePG01..06(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluatePG01, evaluatePG02, evaluatePG03, evaluatePG04, evaluatePG05, evaluatePG06 } from "./dbPostgres";
const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const P = (extra: { taskName: string; stdout: string }[]) => [t("postgres detection (internal)", "present"), ...extra];

it("PG-01 datadir 700 → pass, 750 → fail, missing → skip", () => {
  expect(evaluatePG01(P([t("postgres datadir perms (internal)", "postgres:postgres 700")])).status).toBe("pass");
  expect(evaluatePG01(P([t("postgres datadir perms (internal)", "postgres:postgres 750")])).status).toBe("fail");
  expect(evaluatePG01(P([t("postgres datadir perms (internal)", "__MISSING__")])).status).toBe("skip");
});
it("PG-02 non-root → pass, root → fail, none → review", () => {
  expect(evaluatePG02(P([t("postgres process user (internal)", "postgres /usr/lib/postgresql/16/bin/postgres")])).status).toBe("pass");
  expect(evaluatePG02(P([t("postgres process user (internal)", "root /usr/.../postgres")])).status).toBe("fail");
  expect(evaluatePG02(P([])).status).toBe("review");
});
it("PG-03 conf not world-writable → pass, 666 → fail", () => {
  expect(evaluatePG03(P([t("postgres conf perms (internal)", "postgres:postgres 640")])).status).toBe("pass");
  expect(evaluatePG03(P([t("postgres conf perms (internal)", "postgres:postgres 666")])).status).toBe("fail");
});
it("PG-04 logging_collector on → pass, off/absent → fail", () => {
  expect(evaluatePG04(P([t("postgresql.conf (internal)", "logging_collector = on")])).status).toBe("pass");
  expect(evaluatePG04(P([t("postgresql.conf (internal)", "logging_collector = off")])).status).toBe("fail");
});
it("PG-05 listen_addresses not * → pass, * → fail", () => {
  expect(evaluatePG05(P([t("postgresql.conf (internal)", "listen_addresses = 'localhost'")])).status).toBe("pass");
  expect(evaluatePG05(P([t("postgresql.conf (internal)", "listen_addresses = '*'")])).status).toBe("fail");
});
it("PG-06 ssl on → pass, off/absent → fail", () => {
  expect(evaluatePG06(P([t("postgresql.conf (internal)", "ssl = on")])).status).toBe("pass");
  expect(evaluatePG06(P([t("postgresql.conf (internal)", "ssl = off")])).status).toBe("fail");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가(`import type { CheckResult } from "@/lib/checks/types";`):

```ts
export function evaluatePG01(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getPgState(tasks).datadirPerms;
  if (!perms) return { id: "PG-01", status: "skip", evidence: "데이터 디렉터리를 확인할 수 없음" };
  const ok = noGroupOtherAccess(perms);
  return { id: "PG-01", status: ok ? "pass" : "fail", evidence: `데이터 디렉터리 권한: ${perms}` };
}
export function evaluatePG02(tasks: AnsibleTaskOutput[]): CheckResult {
  const line = getPgState(tasks).processLine;
  if (!line) return { id: "PG-02", status: "review", evidence: "PostgreSQL 프로세스를 확인할 수 없어 실행 계정 판정 불가 — 수동/AI 확인" };
  const user = line.split(/\s+/)[0];
  return { id: "PG-02", status: user === "root" ? "fail" : "pass", evidence: `PostgreSQL 실행 계정: ${user}` };
}
export function evaluatePG03(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getPgState(tasks).confPerms;
  if (!perms) return { id: "PG-03", status: "skip", evidence: "설정 파일을 확인할 수 없음" };
  return { id: "PG-03", status: noOtherWrite(perms) ? "pass" : "fail", evidence: `설정 파일 권한: ${perms}` };
}
export function evaluatePG04(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "logging_collector");
  return { id: "PG-04", status: on ? "pass" : "fail", evidence: on ? "logging_collector가 on" : "logging_collector가 off이거나 미설정" };
}
export function evaluatePG05(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = pgValue(getPgState(tasks).conf, "listen_addresses");
  const exposed = v === "*" || v === "0.0.0.0" || v === "::";
  const ok = v !== null && !exposed;
  return { id: "PG-05", status: ok ? "pass" : "fail", evidence: v === null ? "listen_addresses 미설정" : `listen_addresses: ${v}${exposed ? " (전체 노출)" : ""}` };
}
export function evaluatePG06(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "ssl");
  return { id: "PG-06", status: on ? "pass" : "fail", evidence: on ? "ssl가 on" : "ssl가 off이거나 미설정" };
}
```

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbPostgres.ts src/lib/packs/dbPostgres.test.ts
git commit -m "feat: db-postgresql 평가기 PG-01~06 (#db-postgresql)"
```

---

## Task 4: 평가기 PG-07~12

**Files:** Modify `src/lib/packs/dbPostgres.ts`, `src/lib/packs/dbPostgres.test.ts`

**Interfaces:** Produces `evaluatePG07..12(tasks): CheckResult`; `hbaMethods(hba): string[]`(pg_hba 활성 라인의 METHOD 목록).

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluatePG07, evaluatePG08, evaluatePG09, evaluatePG10, evaluatePG11, evaluatePG12 } from "./dbPostgres";

it("PG-07 trust in pg_hba → fail, scram only → pass", () => {
  expect(evaluatePG07(P([t("pg_hba.conf (internal)", "host all all 0.0.0.0/0 trust")])).status).toBe("fail");
  expect(evaluatePG07(P([t("pg_hba.conf (internal)", "# comment\nlocal all all peer\nhost all all 127.0.0.1/32 scram-sha-256")])).status).toBe("pass");
});
it("PG-08 password_encryption scram → pass, md5/absent → fail", () => {
  expect(evaluatePG08(P([t("postgresql.conf (internal)", "password_encryption = scram-sha-256")])).status).toBe("pass");
  expect(evaluatePG08(P([t("postgresql.conf (internal)", "password_encryption = md5")])).status).toBe("fail");
});
it("PG-09/10 connections/disconnections on → pass, off → fail", () => {
  expect(evaluatePG09(P([t("postgresql.conf (internal)", "log_connections = on")])).status).toBe("pass");
  expect(evaluatePG09(P([t("postgresql.conf (internal)", "log_connections = off")])).status).toBe("fail");
  expect(evaluatePG10(P([t("postgresql.conf (internal)", "log_disconnections = on")])).status).toBe("pass");
});
it("PG-11 → review, PG-12 → review with version", () => {
  expect(evaluatePG11(P([])).status).toBe("review");
  const r = evaluatePG12(P([t("postgres version (internal)", "postgres (PostgreSQL) 16.3")]));
  expect(r.status).toBe("review");
  expect(r.evidence).toContain("16.3");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가:

```ts
// pg_hba.conf 활성 라인의 마지막 필드(METHOD)들. include/기타 지시어는 무시.
export function hbaMethods(hba: string): string[] {
  return hba.split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l && !l.startsWith("###") && /^(local|host|hostssl|hostnossl)\b/i.test(l))
    .map((l) => l.split(/\s+/).pop() as string)
    .filter(Boolean);
}

export function evaluatePG07(tasks: AnsibleTaskOutput[]): CheckResult {
  const methods = hbaMethods(getPgState(tasks).hba);
  if (methods.length === 0) return { id: "PG-07", status: "skip", evidence: "pg_hba.conf 규칙을 확인할 수 없음" };
  const trust = methods.filter((m) => /^trust$/i.test(m));
  return { id: "PG-07", status: trust.length ? "fail" : "pass", evidence: trust.length ? "pg_hba.conf에 trust 인증이 사용됨" : "pg_hba.conf에 trust 인증이 없음" };
}
export function evaluatePG08(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = pgValue(getPgState(tasks).conf, "password_encryption");
  const ok = v !== null && /^scram-sha-256$/i.test(v);
  return { id: "PG-08", status: ok ? "pass" : "fail", evidence: ok ? "password_encryption=scram-sha-256" : `password_encryption: ${v ?? "미설정"}` };
}
export function evaluatePG09(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "log_connections");
  return { id: "PG-09", status: on ? "pass" : "fail", evidence: on ? "log_connections가 on" : "log_connections가 off이거나 미설정" };
}
export function evaluatePG10(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "log_disconnections");
  return { id: "PG-10", status: on ? "pass" : "fail", evidence: on ? "log_disconnections가 on" : "log_disconnections가 off이거나 미설정" };
}
export function evaluatePG11(): CheckResult {
  return { id: "PG-11", status: "review", evidence: "슈퍼유저/과다 권한 역할은 라이브 SQL(pg_roles) 확인이 필요 — 수동 점검" };
}
export function evaluatePG12(tasks: AnsibleTaskOutput[]): CheckResult {
  const version = getPgState(tasks).version || "확인 불가";
  return { id: "PG-12", status: "review", evidence: `PostgreSQL 버전: ${version} — 정적 점검만으로 최신 패치 적용 여부를 단정할 수 없어 벤더 권고와 대조 필요` };
}
```

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbPostgres.ts src/lib/packs/dbPostgres.test.ts
git commit -m "feat: db-postgresql 평가기 PG-07~12 (#db-postgresql)"
```

---

## Task 5: 팩 조립 + 레지스트리 등록

**Files:** Modify `src/lib/packs/dbPostgres.ts`, `src/lib/packs/registry.ts`, `src/lib/packs/registry.test.ts`, `src/lib/packs/resolve.test.ts`, `src/lib/packs/dbPostgres.test.ts`

**Interfaces:** Produces `dbPostgresPack: VendorPack`(itemIds=PG-*만); `ALL_PACKS` 등록.

- [ ] **Step 1: 실패 테스트** — `dbPostgres.test.ts`에 추가 + registry/resolve 갱신:

```ts
import { dbPostgresPack } from "./dbPostgres";
import { getCatalogByCategory } from "@/lib/catalog";

it("dbPostgresPack shape: PG-* only, one result per item", () => {
  const pgIds = getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith("PG-")).sort();
  expect(dbPostgresPack.id).toBe("db-postgresql");
  expect(dbPostgresPack.vendors).toEqual(["PostgreSQL"]);
  expect(dbPostgresPack.itemIds.slice().sort()).toEqual(pgIds);
  expect(dbPostgresPack.itemIds.every((id) => id.startsWith("PG-"))).toBe(true);
  const present = [{ taskName: "postgres detection (internal)", stdout: "present" }];
  expect(dbPostgresPack.evaluate({ findings: null, tasks: present }).map((r) => r.id).sort()).toEqual(pgIds);
  expect(dbPostgresPack.detect(present)).toBe(true);
  expect(dbPostgresPack.detect([])).toBe(false);
});
```
  `registry.test.ts`: `ALL_PACKS`에 `"db-postgresql"` 추가; `findVendorPack("DB","PostgreSQL")?.id === "db-postgresql"` / 소문자.
  `resolve.test.ts`: `server+DB/PostgreSQL → ["os-unix","db-postgresql"]`, evidence에 `"postgres detection (internal)"`.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `dbPostgres.ts` 하단:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import type { EvalContext, VendorPack } from "./types";

function evaluatePg(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    evaluatePG01(t), evaluatePG02(t), evaluatePG03(t), evaluatePG04(t), evaluatePG05(t), evaluatePG06(t),
    evaluatePG07(t), evaluatePG08(t), evaluatePG09(t), evaluatePG10(t), evaluatePG11(), evaluatePG12(t),
  ];
}

export const dbPostgresPack: VendorPack = {
  id: "db-postgresql",
  category: "DB",
  vendors: ["PostgreSQL"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith("PG-")),
  evidenceTasks: PG_EVIDENCE,
  detect: (tasks) => getPgState(tasks).present,
  evaluate: evaluatePg,
};
```
  `registry.ts`: `import { dbPostgresPack } from "./dbPostgres";` + `ALL_PACKS`에 추가.

- [ ] **Step 4: 통과 + 전체 스위트** — `npx vitest run` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/packs/dbPostgres.ts src/lib/packs/registry.ts
git add src/lib/packs/dbPostgres.ts src/lib/packs/registry.ts src/lib/packs/registry.test.ts src/lib/packs/resolve.test.ts src/lib/packs/dbPostgres.test.ts
git commit -m "feat: db-postgresql 팩 조립 + 레지스트리 등록 (#db-postgresql)"
```

---

## Task 6: 실제 흐름 검증 (Docker PostgreSQL E2E)

**Files:** (검증. 버그 발견 시 최소 수정 후 별도 커밋.)

- [ ] **Step 1: 전체 단위 테스트 그린** — `npx vitest run` PASS.
- [ ] **Step 2: 대상 준비** — 컨테이너에 postgresql 설치: `docker exec <c> sh -c 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null 2>&1; ls /etc/postgresql/*/main/ 2>/dev/null; service postgresql start 2>&1 | head -1'`. `DB/PostgreSQL` 자산 등록/override.
- [ ] **Step 3: positive** — 실제 경로로 점검: packs = `os-unix, db-postgresql`, U-* + PG-* 실제 pass/fail/review. 기본 설치의 listen_addresses/ssl/pg_hba 등 판정.
- [ ] **Step 4: negative** — PostgreSQL 없는 컨테이너를 `DB/PostgreSQL`로 → PG-* 전부 review.
- [ ] **Step 5: 벤더 분리 확인** — DB/PostgreSQL 자산은 PG-*만(DB-* MySQL 항목 안 나옴), DB/MySQL 자산은 DB-*만.
- [ ] **Step 6: 최종 게이트** — tsc·eslint·vitest 그린.

---

## Self-Review (완료)

- **스펙 커버리지:** 카탈로그+벤더분리(T1), 증거+파서(T2), PG-01~12(T3/T4), 조립·등록(T5), E2E+분리검증(T6). review=PG-11(SQL)·PG-12(버전)(+PG-02 불명 시 review).
- **핵심 리스크 처리:** DB 카탈로그 DB-*/PG- 공존 → 두 팩 itemIds 프리픽스 필터(T1에서 db-mysql도 DB-*로 수정). 이게 이 사이클의 유일한 기존파일(dbMysql.ts) 로직 변경.
- **타입 일관성:** `getPgState`/`pgValue`/`pgBool`/`hbaMethods`/`noGroupOtherAccess`/`noOtherWrite`, `evaluatePG01..12(tasks)`(PG-11 zero-arg), `dbPostgresPack`.
- **주의:** postgresql.conf 값 파싱(따옴표·인라인주석·마지막매칭), pg_hba METHOD 추출. detection 셸의 `||/&&` 우선순위·`\x27`(작은따옴표) 이스케이프 — `sh -n` 검증. E2E에서 실제 기본 설치 대비 확인.
