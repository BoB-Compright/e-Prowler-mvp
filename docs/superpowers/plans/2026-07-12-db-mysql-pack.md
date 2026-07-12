# DB — MySQL/MariaDB 벤더 팩 (#3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CIS MySQL Benchmark 기준으로 MySQL/MariaDB를 점검하는 `db-mysql` 팩과 DB(CIS) 카탈로그를 추가한다.

**Architecture:** `VendorPack` 계약에 순수 추가. `src/lib/catalog/data/cis/db.json`(DB-01~12)을 신설·등록하고, `src/lib/packs/dbMysql.ts`가 my.cnf/파일권한/프로세스 기반 증거·`getMysqlState` 헬퍼·12 평가기·pack을 정의해 `registry.ts`에 등록한다. 라이브 SQL 미사용, 미탐지·review는 엔진(#0)·AI(#2a)가 처리.

**Tech Stack:** TypeScript, better-sqlite3, vitest, Ansible(raw over ssh/docker).

## Global Constraints

- Node 24로 테스트: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 `npx vitest run`.
- 게이트(커밋 전): `npx tsc --noEmit` && `npx eslint <touched>` && 관련 vitest 통과.
- 순수 추가: 기존 파일 수정은 `catalog/index.ts`(1줄)·`registry.ts`(1줄)뿐.
- 출처 CIS 대등 표기, 불확실 항목번호는 `(항목 확인 필요)`.
- review 최소화: DB-11(라이브 SQL 필수)·DB-12(버전)만 review, 나머지 pass/fail.
- 평가기는 `AnsibleTaskOutput[]`만 받는 순수 함수. 증거 `name` 유일, `raw` 셸 유효 + `; true`.
- 설정값 파싱은 `key=value`/`key value`(대소문자·공백·따옴표·언더스코어/하이픈 혼용) 관용적으로.

---

## File Structure

- Create: `src/lib/catalog/data/cis/db.json` — DB-01~12.
- Modify: `src/lib/catalog/index.ts` — import + CATALOG_SOURCES 1줄.
- Create: `src/lib/packs/dbMysql.ts` — 증거·헬퍼·12평가기·`dbMysqlPack`.
- Create: `src/lib/packs/dbMysql.test.ts`.
- Modify: `src/lib/packs/registry.ts` — ALL_PACKS 1줄.
- Modify: `src/lib/packs/registry.test.ts`, `resolve.test.ts` — DB/MySQL·MariaDB 케이스.

`AnsibleTaskOutput` = `{ taskName, stdout }`. `CheckResult` = `{ id, status, evidence }`.

---

## Task 1: DB 카탈로그(CIS) 신설 + 등록

**Files:** Create `src/lib/catalog/data/cis/db.json`, Modify `src/lib/catalog/index.ts`, Test `src/lib/catalog/index.test.ts`

**Interfaces:** Produces `getCatalogByCategory("db")` → DB-01~12, `frameworkId:"cis"`.

- [ ] **Step 1: 실패 테스트** — `index.test.ts`에 추가:

```ts
it("has 12 CIS-sourced DB items", () => {
  const db = getCatalogByCategory("db");
  expect(db).toHaveLength(12);
  expect(db.every((i) => i.frameworkId === "cis")).toBe(true);
  expect(db.map((i) => i.id)).toContain("DB-01");
  expect(db.map((i) => i.id)).toContain("DB-12");
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/catalog/index.test.ts` → FAIL.

- [ ] **Step 3: 데이터** — `src/lib/catalog/data/cis/db.json`:

```json
[
  { "id": "DB-01", "title": "데이터 디렉터리 접근 권한 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - datadir permissions (항목 확인 필요)" } },
  { "id": "DB-02", "title": "전용 비특권 계정으로 구동", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - dedicated non-admin account (항목 확인 필요)" } },
  { "id": "DB-03", "title": "설정 파일 권한 제한", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - config file permissions (항목 확인 필요)" } },
  { "id": "DB-04", "title": "에러 로그 설정", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - log_error (항목 확인 필요)" } },
  { "id": "DB-05", "title": "심볼릭 링크 비활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - symbolic-links=0 (항목 확인 필요)" } },
  { "id": "DB-06", "title": "LOAD DATA LOCAL 비활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - local_infile (항목 확인 필요)" } },
  { "id": "DB-07", "title": "SSL/TLS 사용", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - require_secure_transport/ssl (항목 확인 필요)" } },
  { "id": "DB-08", "title": "네트워크 노출 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - bind-address/skip-networking (항목 확인 필요)" } },
  { "id": "DB-09", "title": "secure_file_priv 설정", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - secure_file_priv (항목 확인 필요)" } },
  { "id": "DB-10", "title": "비밀번호 검증/인증 플러그인 설정", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - validate_password (항목 확인 필요)" } },
  { "id": "DB-11", "title": "익명/테스트 계정 제거", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - anonymous/test accounts (항목 확인 필요)" } },
  { "id": "DB-12", "title": "주기적 보안 패치 및 버전 관리", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "MySQL Benchmark - patch/version (항목 확인 필요)" } }
]
```

- [ ] **Step 4: 등록** — `src/lib/catalog/index.ts`: `import dbData from "./data/cis/db.json";` + `CATALOG_SOURCES`에 `{ frameworkId: "cis", category: "db", data: dbData as RawItem[] },`. 카탈로그 총계 테스트가 있으면 114→126으로 갱신.

- [ ] **Step 5: 통과 확인** — `npx vitest run src/lib/catalog` → PASS.

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/catalog/data/cis/db.json src/lib/catalog/index.ts src/lib/catalog/index.test.ts
git commit -m "feat: DB(CIS MySQL) 카탈로그 12항목 신설 + 등록 (#db-mysql)"
```

---

## Task 2: MySQL 증거 태스크 + 상태 헬퍼

**Files:** Create `src/lib/packs/dbMysql.ts`(부분), Test `src/lib/packs/dbMysql.test.ts`(부분)

**Interfaces:**
- Produces: `MYSQL_EVIDENCE: PlaybookTask[]`(6); `getMysqlState(tasks): { present, config, datadirPerms, confPerms, processLine, version }`; `cnfValue(config, key): string | null`(설정값 추출, key/value= 또는 key value, 언더스코어/하이픈 무시, 대소문자 무시); `cnfHasFlag(config, key)`(불리언/존재); `noGroupOtherAccess(statLine)`(group·other 접근 전무 — datadir용, 엄격).

- [ ] **Step 1: 실패 테스트** — `dbMysql.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MYSQL_EVIDENCE, getMysqlState, cnfValue, cnfHasFlag } from "./dbMysql";

const present = [
  { taskName: "mysql detection (internal)", stdout: "present\n" },
  { taskName: "mysql config (internal)", stdout: "[mysqld]\nlog_error = /var/log/mysql/error.log\nsymbolic-links=0\nlocal-infile=0\n" },
];

describe("mysql evidence + state", () => {
  it("declares 6 unique evidence tasks", () => {
    const names = MYSQL_EVIDENCE.map((t) => t.name);
    expect(names).toContain("mysql detection (internal)");
    expect(names).toContain("mysql config (internal)");
    expect(new Set(names).size).toBe(names.length);
    expect(MYSQL_EVIDENCE.length).toBe(6);
  });
  it("parses present + config values (underscore/hyphen, spaces, = or space)", () => {
    const s = getMysqlState(present);
    expect(s.present).toBe(true);
    expect(cnfValue(s.config, "log_error")).toBe("/var/log/mysql/error.log");
    expect(cnfValue(s.config, "log-error")).toBe("/var/log/mysql/error.log"); // hyphen/underscore 동일 취급
    expect(cnfValue(s.config, "local_infile")).toBe("0");
    expect(cnfHasFlag(s.config, "symbolic-links")).toBe(true);
    expect(cnfValue(s.config, "nonexistent")).toBeNull();
  });
  it("absent detection", () => {
    expect(getMysqlState([{ taskName: "mysql detection (internal)", stdout: "absent" }]).present).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `src/lib/packs/dbMysql.ts` 상단:

```ts
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";

const MISSING = "__MISSING__";

export const MYSQL_EVIDENCE: PlaybookTask[] = [
  { name: "mysql detection (internal)",
    raw: `sh -c '(command -v mysqld >/dev/null 2>&1 || command -v mariadbd >/dev/null 2>&1 || command -v mysql >/dev/null 2>&1 || [ -f /etc/mysql/my.cnf ] || [ -f /etc/my.cnf ]) && echo present || echo absent; true'` },
  { name: "mysql config (internal)",
    raw: `sh -c 'found=0; for f in /etc/mysql/my.cnf /etc/mysql/mysql.conf.d/*.cnf /etc/mysql/mariadb.conf.d/*.cnf /etc/my.cnf /etc/my.cnf.d/*.cnf; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "mysql datadir perms (internal)",
    raw: `sh -c 'D=$(grep -rhiE "^[[:space:]]*datadir" /etc/mysql /etc/my.cnf /etc/my.cnf.d 2>/dev/null | head -1 | sed "s/.*=//; s/[[:space:]]//g"); [ -z "$D" ] && D=/var/lib/mysql; if [ -d "$D" ]; then stat -c "%U:%G %a" "$D"; else echo ${MISSING}; fi; true'` },
  { name: "mysql conf perms (internal)",
    raw: `sh -c 'for f in /etc/mysql/my.cnf /etc/my.cnf; do if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; exit 0; fi; done; echo ${MISSING}; true'` },
  { name: "mysql process user (internal)",
    raw: `sh -c 'ps -eo user,args 2>/dev/null | grep -iE "mysqld|mariadbd" | grep -v grep | head -1; true'` },
  { name: "mysql version (internal)",
    raw: `sh -c 'if command -v mysqld >/dev/null 2>&1; then mysqld --version 2>&1; elif command -v mariadbd >/dev/null 2>&1; then mariadbd --version 2>&1; else echo ${MISSING}; fi; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}
function rawOut(tasks: AnsibleTaskOutput[], name: string): string {
  const s = findExact(tasks, name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// 활성(주석·빈 줄 제외) 라인. my.cnf 주석은 #, ;.
function activeLines(config: string): string[] {
  return config.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith(";") && !l.startsWith("###") && !l.startsWith("["));
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/-/g, "_");
}

// `key = value` 또는 `key value`. 하이픈/언더스코어 동일 취급, 따옴표 제거.
export function cnfValue(config: string, key: string): string | null {
  const want = normalizeKey(key);
  for (const line of activeLines(config)) {
    const eq = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    const sp = line.match(/^([A-Za-z0-9_-]+)\s+(\S.*)$/);
    const m = eq ?? sp;
    if (m && normalizeKey(m[1]) === want) {
      return m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

// 값 없는 플래그(예: skip-networking) 또는 값 있는 키의 존재 여부.
export function cnfHasFlag(config: string, key: string): boolean {
  const want = normalizeKey(key);
  return activeLines(config).some((line) => {
    const m = line.match(/^([A-Za-z0-9_-]+)/);
    return m ? normalizeKey(m[1]) === want : false;
  });
}

// datadir용 엄격 검사: group·other 어떤 권한도 없어야(750 실패, 700 통과).
export function noGroupOtherAccess(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return g === 0 && o === 0;
}

// world-writable 아님(설정 파일용): other write 비트 없음.
export function noOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  return (Number(mode.slice(-1)) & 2) === 0;
}

export function getMysqlState(tasks: AnsibleTaskOutput[]): {
  present: boolean; config: string; datadirPerms: string; confPerms: string; processLine: string; version: string;
} {
  const present = findExact(tasks, "mysql detection (internal)")?.stdout.trim() === "present";
  return {
    present,
    config: rawOut(tasks, "mysql config (internal)"),
    datadirPerms: rawOut(tasks, "mysql datadir perms (internal)").trim(),
    confPerms: rawOut(tasks, "mysql conf perms (internal)").trim(),
    processLine: (findExact(tasks, "mysql process user (internal)")?.stdout ?? "").trim(),
    version: rawOut(tasks, "mysql version (internal)").trim(),
  };
}
```
  주의: `raw` 셸 변수(`$f`,`$D`)는 `$` 유지, `${MISSING}`만 TS 보간. `sh -n`으로 6개 검증.

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbMysql.ts src/lib/packs/dbMysql.test.ts
git commit -m "feat: db-mysql 증거 태스크 + 상태 헬퍼 (#db-mysql)"
```

---

## Task 3: 평가기 DB-01~06

**Files:** Modify `src/lib/packs/dbMysql.ts`, `src/lib/packs/dbMysql.test.ts`

**Interfaces:** Produces `evaluateDB01..06(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateDB01, evaluateDB02, evaluateDB03, evaluateDB04, evaluateDB05, evaluateDB06 } from "./dbMysql";
const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const D = (extra: { taskName: string; stdout: string }[]) => [t("mysql detection (internal)", "present"), ...extra];

it("DB-01 datadir 700 → pass, 755 → fail, missing → skip", () => {
  expect(evaluateDB01(D([t("mysql datadir perms (internal)", "mysql:mysql 700")])).status).toBe("pass");
  expect(evaluateDB01(D([t("mysql datadir perms (internal)", "mysql:mysql 755")])).status).toBe("fail");
  expect(evaluateDB01(D([t("mysql datadir perms (internal)", "__MISSING__")])).status).toBe("skip");
});
it("DB-02 non-root → pass, root → fail, none → review", () => {
  expect(evaluateDB02(D([t("mysql process user (internal)", "mysql /usr/sbin/mysqld")])).status).toBe("pass");
  expect(evaluateDB02(D([t("mysql process user (internal)", "root /usr/sbin/mysqld")])).status).toBe("fail");
  expect(evaluateDB02(D([])).status).toBe("review");
});
it("DB-03 conf not world-writable → pass, 666 → fail", () => {
  expect(evaluateDB03(D([t("mysql conf perms (internal)", "root:root 644")])).status).toBe("pass");
  expect(evaluateDB03(D([t("mysql conf perms (internal)", "root:root 666")])).status).toBe("fail");
});
it("DB-04 log_error set → pass, absent → fail", () => {
  expect(evaluateDB04(D([t("mysql config (internal)", "[mysqld]\nlog_error=/var/log/mysql/e.log")])).status).toBe("pass");
  expect(evaluateDB04(D([t("mysql config (internal)", "[mysqld]\nport=3306")])).status).toBe("fail");
});
it("DB-05 symbolic-links=0 → pass, =1 → fail", () => {
  expect(evaluateDB05(D([t("mysql config (internal)", "symbolic-links=0")])).status).toBe("pass");
  expect(evaluateDB05(D([t("mysql config (internal)", "skip-symbolic-links")])).status).toBe("pass");
  expect(evaluateDB05(D([t("mysql config (internal)", "symbolic-links=1")])).status).toBe("fail");
});
it("DB-06 local_infile off → pass, on/absent → fail", () => {
  expect(evaluateDB06(D([t("mysql config (internal)", "local-infile=0")])).status).toBe("pass");
  expect(evaluateDB06(D([t("mysql config (internal)", "local_infile=ON")])).status).toBe("fail");
  expect(evaluateDB06(D([t("mysql config (internal)", "[mysqld]")])).status).toBe("fail");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가(`import type { CheckResult } from "@/lib/checks/types";`):

```ts
export function evaluateDB01(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getMysqlState(tasks).datadirPerms;
  if (!perms) return { id: "DB-01", status: "skip", evidence: "데이터 디렉터리를 확인할 수 없음" };
  const ok = noGroupOtherAccess(perms);
  return { id: "DB-01", status: ok ? "pass" : "fail", evidence: `데이터 디렉터리 권한: ${perms}` };
}

export function evaluateDB02(tasks: AnsibleTaskOutput[]): CheckResult {
  const line = getMysqlState(tasks).processLine;
  if (!line) return { id: "DB-02", status: "review", evidence: "MySQL 프로세스를 확인할 수 없어 실행 계정 판정 불가 — 수동/AI 확인" };
  const user = line.split(/\s+/)[0];
  return { id: "DB-02", status: user === "root" ? "fail" : "pass", evidence: `MySQL 실행 계정: ${user}` };
}

export function evaluateDB03(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getMysqlState(tasks).confPerms;
  if (!perms) return { id: "DB-03", status: "skip", evidence: "설정 파일을 확인할 수 없음" };
  const ok = noOtherWrite(perms);
  return { id: "DB-03", status: ok ? "pass" : "fail", evidence: `설정 파일 권한: ${perms}` };
}

export function evaluateDB04(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = cnfValue(getMysqlState(tasks).config, "log_error");
  const on = v !== null && v !== "";
  return { id: "DB-04", status: on ? "pass" : "fail", evidence: on ? `log_error 설정: ${v}` : "log_error(에러 로그)가 설정되어 있지 않음" };
}

export function evaluateDB05(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getMysqlState(tasks).config;
  const skip = cnfHasFlag(config, "skip-symbolic-links");
  const sym = cnfValue(config, "symbolic-links");
  const disabled = skip || sym === "0";
  return { id: "DB-05", status: disabled ? "pass" : "fail", evidence: disabled ? "심볼릭 링크가 비활성화됨" : `심볼릭 링크가 비활성화되어 있지 않음 (symbolic-links=${sym ?? "미설정"})` };
}

export function evaluateDB06(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = cnfValue(getMysqlState(tasks).config, "local_infile");
  const off = v !== null && /^(0|off|false)$/i.test(v);
  return { id: "DB-06", status: off ? "pass" : "fail", evidence: off ? "local_infile(LOAD DATA LOCAL)이 비활성화됨" : `local_infile이 비활성화되어 있지 않음 (${v ?? "미설정 — 기본 활성"})` };
}
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbMysql.ts src/lib/packs/dbMysql.test.ts
git commit -m "feat: db-mysql 평가기 DB-01~06 (#db-mysql)"
```

---

## Task 4: 평가기 DB-07~12

**Files:** Modify `src/lib/packs/dbMysql.ts`, `src/lib/packs/dbMysql.test.ts`

**Interfaces:** Produces `evaluateDB07..12(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateDB07, evaluateDB08, evaluateDB09, evaluateDB10, evaluateDB11, evaluateDB12 } from "./dbMysql";

it("DB-07 require_secure_transport ON or ssl-cert → pass, none → fail", () => {
  expect(evaluateDB07(D([t("mysql config (internal)", "require_secure_transport=ON")])).status).toBe("pass");
  expect(evaluateDB07(D([t("mysql config (internal)", "ssl-cert=/etc/mysql/server-cert.pem")])).status).toBe("pass");
  expect(evaluateDB07(D([t("mysql config (internal)", "[mysqld]")])).status).toBe("fail");
});
it("DB-08 bind-address 127.0.0.1 → pass, 0.0.0.0 → fail, skip-networking → pass", () => {
  expect(evaluateDB08(D([t("mysql config (internal)", "bind-address=127.0.0.1")])).status).toBe("pass");
  expect(evaluateDB08(D([t("mysql config (internal)", "bind-address=0.0.0.0")])).status).toBe("fail");
  expect(evaluateDB08(D([t("mysql config (internal)", "skip-networking")])).status).toBe("pass");
});
it("DB-09 secure_file_priv set → pass, empty → fail, absent → fail", () => {
  expect(evaluateDB09(D([t("mysql config (internal)", "secure_file_priv=/var/lib/mysql-files")])).status).toBe("pass");
  expect(evaluateDB09(D([t("mysql config (internal)", "secure_file_priv=\"\"")])).status).toBe("fail");
  expect(evaluateDB09(D([t("mysql config (internal)", "[mysqld]")])).status).toBe("fail");
});
it("DB-10 validate_password configured → pass, absent → review", () => {
  expect(evaluateDB10(D([t("mysql config (internal)", "validate_password.policy=STRONG")])).status).toBe("pass");
  expect(evaluateDB10(D([t("mysql config (internal)", "[mysqld]")])).status).toBe("review");
});
it("DB-11 → review (SQL 필요)", () => {
  expect(evaluateDB11(D([])).status).toBe("review");
});
it("DB-12 → review with version evidence", () => {
  const r = evaluateDB12(D([t("mysql version (internal)", "mysqld  Ver 8.0.36 for Linux")]));
  expect(r.status).toBe("review");
  expect(r.evidence).toContain("8.0.36");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가:

```ts
export function evaluateDB07(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getMysqlState(tasks).config;
  const rst = cnfValue(config, "require_secure_transport");
  const sslCert = cnfValue(config, "ssl_cert") ?? cnfValue(config, "ssl-cert");
  const on = (rst !== null && /^(on|1|true)$/i.test(rst)) || (sslCert !== null && sslCert !== "");
  return { id: "DB-07", status: on ? "pass" : "fail", evidence: on ? "SSL/TLS가 설정됨" : "SSL/TLS 설정(require_secure_transport/ssl-cert)이 확인되지 않음" };
}

export function evaluateDB08(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getMysqlState(tasks).config;
  if (cnfHasFlag(config, "skip-networking")) return { id: "DB-08", status: "pass", evidence: "네트워킹이 비활성화됨(skip-networking)" };
  const bind = cnfValue(config, "bind-address");
  if (bind === null) return { id: "DB-08", status: "fail", evidence: "bind-address가 설정되어 있지 않음(기본 노출 위험)" };
  const exposed = bind === "0.0.0.0" || bind === "*" || bind === "::";
  return { id: "DB-08", status: exposed ? "fail" : "pass", evidence: `bind-address: ${bind}` };
}

export function evaluateDB09(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = cnfValue(getMysqlState(tasks).config, "secure_file_priv");
  const ok = v !== null && v !== "";
  return { id: "DB-09", status: ok ? "pass" : "fail", evidence: ok ? `secure_file_priv: ${v}` : "secure_file_priv가 비어 있거나 미설정(파일 입출력 제한 없음)" };
}

export function evaluateDB10(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getMysqlState(tasks).config;
  const configured = activeLines(config).some((l) => /^validate[_-]password/i.test(l));
  if (configured) return { id: "DB-10", status: "pass", evidence: "validate_password(비밀번호 검증)가 설정됨" };
  return { id: "DB-10", status: "review", evidence: "설정 파일에서 validate_password 구성을 확인할 수 없음 — 플러그인 로드는 라이브 SQL 확인 필요(수동/AI)" };
}

export function evaluateDB11(_tasks: AnsibleTaskOutput[]): CheckResult {
  return { id: "DB-11", status: "review", evidence: "익명/테스트 계정 존재 여부는 라이브 SQL(SELECT ... FROM mysql.user) 확인이 필요 — 수동 점검" };
}

export function evaluateDB12(tasks: AnsibleTaskOutput[]): CheckResult {
  const raw = getMysqlState(tasks).version;
  const version = raw && raw !== "__MISSING__" ? raw : "확인 불가";
  return { id: "DB-12", status: "review", evidence: `DB 버전: ${version} — 정적 점검만으로 최신 패치 적용 여부를 단정할 수 없어 벤더 권고와 대조 필요` };
}
```
  주의: `evaluateDB10`이 `activeLines`를 쓰므로 그 헬퍼가 파일에 있어야 함(Task 2에서 정의). Task 2의 `activeLines`가 로컬(비-export)이면 그대로 같은 파일 내 사용 가능.

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbMysql.ts src/lib/packs/dbMysql.test.ts
git commit -m "feat: db-mysql 평가기 DB-07~12 (#db-mysql)"
```

---

## Task 5: 팩 조립 + 레지스트리 등록

**Files:** Modify `src/lib/packs/dbMysql.ts`, `src/lib/packs/registry.ts`, `src/lib/packs/registry.test.ts`, `src/lib/packs/resolve.test.ts`, `src/lib/packs/dbMysql.test.ts`

**Interfaces:** Produces `dbMysqlPack: VendorPack`; `ALL_PACKS` 등록.

- [ ] **Step 1: 실패 테스트** — `dbMysql.test.ts`에 추가 + registry/resolve 갱신:

```ts
import { dbMysqlPack } from "./dbMysql";
import { getCatalogByCategory } from "@/lib/catalog";

it("dbMysqlPack shape + evaluate one result per DB item", () => {
  const dbIds = getCatalogByCategory("db").map((i) => i.id).sort();
  expect(dbMysqlPack.id).toBe("db-mysql");
  expect(dbMysqlPack.vendors).toEqual(["MySQL", "MariaDB"]);
  expect(dbMysqlPack.itemIds.slice().sort()).toEqual(dbIds);
  const present = [{ taskName: "mysql detection (internal)", stdout: "present" }];
  expect(dbMysqlPack.evaluate({ findings: null, tasks: present }).map((r) => r.id).sort()).toEqual(dbIds);
  expect(dbMysqlPack.detect(present)).toBe(true);
  expect(dbMysqlPack.detect([])).toBe(false);
});
```
  `registry.test.ts`: `ALL_PACKS` 정렬 단언에 `"db-mysql"` 추가; `findVendorPack("DB","MySQL")?.id === "db-mysql"` / `("DB","MariaDB")` / 소문자.
  `resolve.test.ts`: `server+DB/MySQL → ["os-unix","db-mysql"]`, evidence에 `"mysql detection (internal)"` 포함.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `dbMysql.ts` 하단:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import type { EvalContext, VendorPack } from "./types";

function evaluateMysql(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    evaluateDB01(t), evaluateDB02(t), evaluateDB03(t), evaluateDB04(t), evaluateDB05(t), evaluateDB06(t),
    evaluateDB07(t), evaluateDB08(t), evaluateDB09(t), evaluateDB10(t), evaluateDB11(t), evaluateDB12(t),
  ];
}

export const dbMysqlPack: VendorPack = {
  id: "db-mysql",
  category: "DB",
  vendors: ["MySQL", "MariaDB"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("db").map((i) => i.id),
  evidenceTasks: MYSQL_EVIDENCE,
  detect: (tasks) => getMysqlState(tasks).present,
  evaluate: evaluateMysql,
};
```
  `registry.ts`: `import { dbMysqlPack } from "./dbMysql";` + `ALL_PACKS`에 추가.

- [ ] **Step 4: 통과 + 전체 스위트** — `npx vitest run` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/packs/dbMysql.ts src/lib/packs/registry.ts
git add src/lib/packs/dbMysql.ts src/lib/packs/registry.ts src/lib/packs/registry.test.ts src/lib/packs/resolve.test.ts src/lib/packs/dbMysql.test.ts
git commit -m "feat: db-mysql 팩 조립 + 레지스트리 등록 (#db-mysql)"
```

---

## Task 6: 실제 흐름 검증 (Docker MySQL/MariaDB E2E)

**Files:** (검증. 버그 발견 시 최소 수정 후 별도 커밋.)

- [ ] **Step 1: 전체 단위 테스트 그린** — `npx vitest run` PASS.

- [ ] **Step 2: DB 대상 준비** — 컨테이너에 mariadb-server(또는 mysql-server) 설치:
```bash
docker exec <container> sh -c 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server >/dev/null 2>&1; ls /etc/mysql/ 2>/dev/null; ls -ld /var/lib/mysql 2>/dev/null'
```
  DB에 `category=DB, vendor=MySQL`(또는 MariaDB) 서버 자산 등록/재활용(기존 `테스트-DB-Oracle`(2234)을 MySQL로 override하거나 신규).

- [ ] **Step 3: positive 검증** — 실제 경로(tsx: resolveCheckPlan→runAnsibleForServer(evidence)→evaluatePlan)로 점검. 기대: packs = `os-unix, db-mysql`, U-* 베이스라인 + DB-*가 실제 pass/fail/review(전부 review 아님). 기본 설치의 datadir 권한/실행계정/local_infile 등이 판정됨.

- [ ] **Step 4: negative 검증** — DB 없는 컨테이너를 `DB/MySQL`로 점검 → DB-* 전부 `review`("선언된 MySQL/MariaDB 미확인").

- [ ] **Step 5: OS 베이스라인 병존 + CIS 필터** — DB 결과에 U-* 병존, 카탈로그/리포트 CIS 필터로 DB 항목만 보기.

- [ ] **Step 6: 최종 게이트** — `npx tsc --noEmit && npx eslint <touched> && npx vitest run` 그린.

---

## Self-Review (완료)

- **스펙 커버리지:** 카탈로그(T1), 증거+상태+파서(T2), DB-01~12 판정(T3/T4, 스펙 표와 분류 일치), 조립·등록(T5), E2E(T6). review = DB-11(SQL)·DB-12(버전)(+DB-02/10 불명 시 review).
- **플레이스홀더:** 각 평가기·테스트·데이터 완전 포함.
- **타입 일관성:** `getMysqlState`/`cnfValue`/`cnfHasFlag`/`noGroupOtherAccess`/`noOtherWrite`/`activeLines`, `evaluateDB01..12(tasks)`, `dbMysqlPack`(VendorPack), `getCatalogByCategory("db")` 전반 일치.
- **주의:** my.cnf 값 파싱이 `cnfValue`/`cnfHasFlag`에 집중 — 하이픈/언더스코어·= /공백·따옴표·섹션헤더([mysqld]) 처리. E2E(T6)·최종 리뷰에서 실제 mariadb 기본 my.cnf 대비 확인.
