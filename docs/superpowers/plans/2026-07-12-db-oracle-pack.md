# DB — Oracle 벤더 팩 (#3c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** CIS Oracle Database Benchmark 기준 `db-oracle` 팩(ORA-01~12)을 추가한다(파일권한·프로세스·listener.ora/sqlnet.ora/pfile 기반, SQL/spfile 의존은 review).

**Architecture:** DB 카탈로그(`db.json`)에 ORA-01~12 추가. `src/lib/packs/dbOracle.ts`가 Oracle 증거·`getOracleState`·파서·12 평가기·pack. itemIds는 ORA-* 프리픽스 필터(db-mysql=DB-*, db-postgresql=PG-*, db-oracle=ORA-*). `registry.ts` 등록.

**Tech Stack:** TypeScript, better-sqlite3, vitest, Ansible(raw over ssh).

## Global Constraints

- Node 24 테스트; 게이트 tsc+eslint+vitest.
- 출처 CIS 대등, 불확실 `(항목 확인 필요)`.
- review 최소화: ORA-11(SQL)·ORA-12(버전)·ORA-09/10(pfile 없으면) review, 나머지 pass/fail.
- 평가기 순수 함수; 증거 `name` 유일, `raw` 셸 유효 + `; true`(`sh -n`).
- 벤더 분리: db-oracle itemIds = ORA-* only, evaluate 결과 개수 = itemIds.

---

## Task 1: ORA 카탈로그 추가

**Files:** Modify `src/lib/catalog/data/cis/db.json`, Test `src/lib/catalog/index.test.ts`

- [ ] **Step 1: 실패 테스트** — `index.test.ts`에 추가:

```ts
it("db category has ORA-* (Oracle) 12 items too", () => {
  const ids = getCatalogByCategory("db").map((i) => i.id);
  expect(ids.filter((i) => i.startsWith("ORA-"))).toHaveLength(12);
  expect(ids).toContain("ORA-01");
  expect(ids).toContain("ORA-12");
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/catalog/index.test.ts` → FAIL.

- [ ] **Step 3: 데이터** — `db.json` 배열 끝(PG-12 뒤, `,`로 이어)에 ORA-01~12 추가. 형식은 기존과 동일:

```json
  ,{ "id": "ORA-01", "title": "ORACLE_HOME 접근 권한 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - ORACLE_HOME permissions (항목 확인 필요)" } },
  { "id": "ORA-02", "title": "전용 비특권 계정으로 구동", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - dedicated OS account (항목 확인 필요)" } },
  { "id": "ORA-03", "title": "listener.ora 권한 제한", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - listener.ora permissions (항목 확인 필요)" } },
  { "id": "ORA-04", "title": "리스너 관리 제한(ADMIN_RESTRICTIONS)", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - ADMIN_RESTRICTIONS (항목 확인 필요)" } },
  { "id": "ORA-05", "title": "외부 프로시저(extproc) 노출 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - extproc (항목 확인 필요)" } },
  { "id": "ORA-06", "title": "네트워크 인증 서비스 설정", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - SQLNET.AUTHENTICATION_SERVICES (항목 확인 필요)" } },
  { "id": "ORA-07", "title": "네트워크 암호화 설정", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - SQLNET.ENCRYPTION_SERVER (항목 확인 필요)" } },
  { "id": "ORA-08", "title": "리스너 로깅 활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - listener logging (항목 확인 필요)" } },
  { "id": "ORA-09", "title": "감사(audit_trail) 활성화", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - audit_trail (항목 확인 필요)" } },
  { "id": "ORA-10", "title": "remote_login_passwordfile 설정", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - remote_login_passwordfile (항목 확인 필요)" } },
  { "id": "ORA-11", "title": "기본 계정/권한 관리", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - default accounts/privileges (항목 확인 필요)" } },
  { "id": "ORA-12", "title": "주기적 보안 패치 및 버전 관리", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Oracle Database Benchmark - patch/version (항목 확인 필요)" } }
```
  카탈로그 총계 테스트가 있으면 138→150.

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/catalog/data/cis/db.json src/lib/catalog/index.test.ts
git commit -m "feat: ORA 카탈로그 12항목 추가 (#db-oracle)"
```

---

## Task 2: Oracle 증거 + 상태 헬퍼 + 파서

**Files:** Create `src/lib/packs/dbOracle.ts`(부분), Test `src/lib/packs/dbOracle.test.ts`(부분)

**Interfaces:** Produces `ORACLE_EVIDENCE: PlaybookTask[]`(8); `getOracleState(tasks): { present, listener, sqlnet, pfile, homePerms, listenerPerms, processLine, version }`; `oraActiveText(text)`(주석 # 제거·소문자 아님 원본 유지); `oraValue(text, key)`(key=value 마지막 매칭, 대소문자 무시, 따옴표 제거); `oraHas(text, regex)`; `noGroupOtherWrite(statLine)`.

- [ ] **Step 1: 실패 테스트** — `dbOracle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ORACLE_EVIDENCE, getOracleState, oraValue, oraHas } from "./dbOracle";

const present = [
  { taskName: "oracle detection (internal)", stdout: "present\n" },
  { taskName: "oracle sqlnet.ora (internal)", stdout: "# c\nSQLNET.ENCRYPTION_SERVER = REQUIRED\nSQLNET.AUTHENTICATION_SERVICES = (NONE)\n" },
  { taskName: "oracle listener.ora (internal)", stdout: "ADMIN_RESTRICTIONS_LISTENER = ON\n" },
];

describe("oracle evidence + state", () => {
  it("declares 8 unique evidence tasks", () => {
    const names = ORACLE_EVIDENCE.map((t) => t.name);
    expect(names).toContain("oracle detection (internal)");
    expect(names).toContain("oracle listener.ora (internal)");
    expect(names).toContain("oracle sqlnet.ora (internal)");
    expect(new Set(names).size).toBe(names.length);
    expect(ORACLE_EVIDENCE.length).toBe(8);
  });
  it("parses values + presence (case-insensitive, ignores comments)", () => {
    const s = getOracleState(present);
    expect(s.present).toBe(true);
    expect(oraValue(s.sqlnet, "SQLNET.ENCRYPTION_SERVER")).toBe("REQUIRED");
    expect(oraValue(s.sqlnet, "sqlnet.authentication_services")).toBe("(NONE)");
    expect(oraHas(s.listener, /ADMIN_RESTRICTIONS_\w+\s*=\s*on/i)).toBe(true);
  });
  it("absent detection", () => {
    expect(getOracleState([{ taskName: "oracle detection (internal)", stdout: "absent" }]).present).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `src/lib/packs/dbOracle.ts` 상단:

```ts
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";

const MISSING = "__MISSING__";
const TNS = "$TNS_ADMIN/listener.ora /opt/oracle/*/network/admin/listener.ora /u01/*/network/admin/listener.ora /opt/oracle/product/*/*/network/admin/listener.ora";
const SQLNET = "$TNS_ADMIN/sqlnet.ora /opt/oracle/*/network/admin/sqlnet.ora /u01/*/network/admin/sqlnet.ora /opt/oracle/product/*/*/network/admin/sqlnet.ora";
const PFILE = "/opt/oracle/*/dbs/init*.ora /u01/*/dbs/init*.ora $ORACLE_HOME/dbs/init*.ora";

export const ORACLE_EVIDENCE: PlaybookTask[] = [
  { name: "oracle detection (internal)",
    raw: `sh -c 'p=absent; if command -v tnslsnr >/dev/null 2>&1 || command -v sqlplus >/dev/null 2>&1 || [ -f /etc/oratab ]; then p=present; else for f in ${TNS}; do [ -f "$f" ] && p=present && break; done; fi; echo "$p"; true'` },
  { name: "oracle listener.ora (internal)",
    raw: `sh -c 'found=0; for f in ${TNS}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "oracle sqlnet.ora (internal)",
    raw: `sh -c 'found=0; for f in ${SQLNET}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "oracle init pfile (internal)",
    raw: `sh -c 'found=0; for f in ${PFILE}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "oracle home perms (internal)",
    raw: `sh -c 'H="$ORACLE_HOME"; if [ -z "$H" ]; then for c in /opt/oracle/product/*/* /u01/app/oracle/product/*/*; do [ -d "$c" ] && H="$c" && break; done; fi; if [ -n "$H" ] && [ -d "$H" ]; then stat -c "%U:%G %a" "$H"; else echo ${MISSING}; fi; true'` },
  { name: "oracle listener.ora perms (internal)",
    raw: `sh -c 'for f in ${TNS}; do if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; exit 0; fi; done; echo ${MISSING}; true'` },
  { name: "oracle process user (internal)",
    raw: `sh -c 'ps -eo user,args 2>/dev/null | grep -iE "tnslsnr|ora_pmon|_pmon_" | grep -v grep | head -1; true'` },
  { name: "oracle version (internal)",
    raw: `sh -c 'if command -v sqlplus >/dev/null 2>&1; then sqlplus -V 2>&1 | head -1; elif command -v tnslsnr >/dev/null 2>&1; then tnslsnr version 2>&1 | head -1; else echo ${MISSING}; fi; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}
function rawOut(tasks: AnsibleTaskOutput[], name: string): string {
  const s = findExact(tasks, name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// 주석(#) 제거한 원본 텍스트(대소문자 유지, ### 파일구분 라인 제거).
export function oraActiveText(text: string): string {
  return text.split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .filter((l) => !l.trim().startsWith("###"))
    .join("\n");
}

// key = value, 마지막 매칭, 대소문자 무시, 따옴표 제거. Oracle 파라미터명은 점(.) 포함 가능.
export function oraValue(text: string, key: string): string | null {
  const want = key.trim().toLowerCase();
  let val: string | null = null;
  for (const line of oraActiveText(text).split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)$/);
    if (m && m[1].toLowerCase() === want) {
      val = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return val;
}

export function oraHas(text: string, re: RegExp): boolean {
  return re.test(oraActiveText(text));
}

export function noGroupOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return (g & 2) === 0 && (o & 2) === 0;
}

export function getOracleState(tasks: AnsibleTaskOutput[]): {
  present: boolean; listener: string; sqlnet: string; pfile: string; homePerms: string; listenerPerms: string; processLine: string; version: string;
} {
  return {
    present: findExact(tasks, "oracle detection (internal)")?.stdout.trim() === "present",
    listener: rawOut(tasks, "oracle listener.ora (internal)"),
    sqlnet: rawOut(tasks, "oracle sqlnet.ora (internal)"),
    pfile: rawOut(tasks, "oracle init pfile (internal)"),
    homePerms: rawOut(tasks, "oracle home perms (internal)").trim(),
    listenerPerms: rawOut(tasks, "oracle listener.ora perms (internal)").trim(),
    processLine: (findExact(tasks, "oracle process user (internal)")?.stdout ?? "").trim(),
    version: rawOut(tasks, "oracle version (internal)").trim(),
  };
}
```
  주의: `raw`의 `$TNS_ADMIN`/`$ORACLE_HOME`/`$H`/`$f`/`$c`/`$p`는 셸용, `${TNS}`/`${SQLNET}`/`${PFILE}`/`${MISSING}`만 TS 보간. detection·perms는 다중 glob `ls` 회피(루프+`[-f]`). `sh -n`으로 8개 검증.

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbOracle.ts src/lib/packs/dbOracle.test.ts
git commit -m "feat: db-oracle 증거 태스크 + 상태 헬퍼 + 파서 (#db-oracle)"
```

---

## Task 3: 평가기 ORA-01~06

**Files:** Modify `src/lib/packs/dbOracle.ts`, `src/lib/packs/dbOracle.test.ts`

**Interfaces:** Produces `evaluateORA01..06(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateORA01, evaluateORA02, evaluateORA03, evaluateORA04, evaluateORA05, evaluateORA06 } from "./dbOracle";
const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const O = (extra: { taskName: string; stdout: string }[]) => [t("oracle detection (internal)", "present"), ...extra];

it("ORA-01 home no group/other write → pass, 775 → fail, missing → skip", () => {
  expect(evaluateORA01(O([t("oracle home perms (internal)", "oracle:oinstall 750")])).status).toBe("pass");
  expect(evaluateORA01(O([t("oracle home perms (internal)", "oracle:oinstall 775")])).status).toBe("fail");
  expect(evaluateORA01(O([t("oracle home perms (internal)", "__MISSING__")])).status).toBe("skip");
});
it("ORA-02 non-root → pass, root → fail, none → review", () => {
  expect(evaluateORA02(O([t("oracle process user (internal)", "oracle tnslsnr LISTENER")])).status).toBe("pass");
  expect(evaluateORA02(O([t("oracle process user (internal)", "root tnslsnr LISTENER")])).status).toBe("fail");
  expect(evaluateORA02(O([])).status).toBe("review");
});
it("ORA-03 listener perms 640 → pass, 666 → fail, missing → skip", () => {
  expect(evaluateORA03(O([t("oracle listener.ora perms (internal)", "oracle:oinstall 640")])).status).toBe("pass");
  expect(evaluateORA03(O([t("oracle listener.ora perms (internal)", "oracle:oinstall 666")])).status).toBe("fail");
  expect(evaluateORA03(O([t("oracle listener.ora perms (internal)", "__MISSING__")])).status).toBe("skip");
});
it("ORA-04 ADMIN_RESTRICTIONS on → pass, absent → fail, no listener → skip", () => {
  expect(evaluateORA04(O([t("oracle listener.ora (internal)", "ADMIN_RESTRICTIONS_LISTENER=on")])).status).toBe("pass");
  expect(evaluateORA04(O([t("oracle listener.ora (internal)", "LISTENER=(DESCRIPTION=...)")])).status).toBe("fail");
  expect(evaluateORA04(O([t("oracle listener.ora (internal)", "__MISSING__")])).status).toBe("skip");
});
it("ORA-05 extproc present → fail, absent → pass", () => {
  expect(evaluateORA05(O([t("oracle listener.ora (internal)", "(PROGRAM = extproc)")])).status).toBe("fail");
  expect(evaluateORA05(O([t("oracle listener.ora (internal)", "LISTENER=(DESCRIPTION=(ADDRESS=...))")])).status).toBe("pass");
});
it("ORA-06 auth services set → pass, absent → fail", () => {
  expect(evaluateORA06(O([t("oracle sqlnet.ora (internal)", "SQLNET.AUTHENTICATION_SERVICES = (NONE)")])).status).toBe("pass");
  expect(evaluateORA06(O([t("oracle sqlnet.ora (internal)", "# empty")])).status).toBe("fail");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가(`import type { CheckResult } from "@/lib/checks/types";`):

```ts
export function evaluateORA01(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getOracleState(tasks).homePerms;
  if (!perms) return { id: "ORA-01", status: "skip", evidence: "ORACLE_HOME을 확인할 수 없음" };
  return { id: "ORA-01", status: noGroupOtherWrite(perms) ? "pass" : "fail", evidence: `ORACLE_HOME 권한: ${perms}` };
}
export function evaluateORA02(tasks: AnsibleTaskOutput[]): CheckResult {
  const line = getOracleState(tasks).processLine;
  if (!line) return { id: "ORA-02", status: "review", evidence: "Oracle 프로세스를 확인할 수 없어 실행 계정 판정 불가 — 수동/AI 확인" };
  const user = line.split(/\s+/)[0];
  return { id: "ORA-02", status: user === "root" ? "fail" : "pass", evidence: `Oracle 실행 계정: ${user}` };
}
export function evaluateORA03(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getOracleState(tasks).listenerPerms;
  if (!perms) return { id: "ORA-03", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  return { id: "ORA-03", status: noGroupOtherWrite(perms) ? "pass" : "fail", evidence: `listener.ora 권한: ${perms}` };
}
export function evaluateORA04(tasks: AnsibleTaskOutput[]): CheckResult {
  const { listener } = getOracleState(tasks);
  if (!listener) return { id: "ORA-04", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  const ok = oraHas(listener, /ADMIN_RESTRICTIONS_\w+\s*=\s*(on|true|yes)/i);
  return { id: "ORA-04", status: ok ? "pass" : "fail", evidence: ok ? "ADMIN_RESTRICTIONS가 ON" : "ADMIN_RESTRICTIONS가 설정되어 있지 않음" };
}
export function evaluateORA05(tasks: AnsibleTaskOutput[]): CheckResult {
  const { listener } = getOracleState(tasks);
  if (!listener) return { id: "ORA-05", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  const extproc = oraHas(listener, /extproc/i);
  return { id: "ORA-05", status: extproc ? "fail" : "pass", evidence: extproc ? "리스너에 외부 프로시저(extproc) 등록이 있음" : "extproc 등록이 없음" };
}
export function evaluateORA06(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = oraValue(getOracleState(tasks).sqlnet, "SQLNET.AUTHENTICATION_SERVICES");
  const ok = v !== null && v !== "";
  return { id: "ORA-06", status: ok ? "pass" : "fail", evidence: ok ? `SQLNET.AUTHENTICATION_SERVICES: ${v}` : "SQLNET.AUTHENTICATION_SERVICES가 설정되어 있지 않음" };
}
```

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbOracle.ts src/lib/packs/dbOracle.test.ts
git commit -m "feat: db-oracle 평가기 ORA-01~06 (#db-oracle)"
```

---

## Task 4: 평가기 ORA-07~12

**Files:** Modify `src/lib/packs/dbOracle.ts`, `src/lib/packs/dbOracle.test.ts`

**Interfaces:** Produces `evaluateORA07..12(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateORA07, evaluateORA08, evaluateORA09, evaluateORA10, evaluateORA11, evaluateORA12 } from "./dbOracle";

it("ORA-07 encryption set → pass, absent → fail", () => {
  expect(evaluateORA07(O([t("oracle sqlnet.ora (internal)", "SQLNET.ENCRYPTION_SERVER = REQUIRED")])).status).toBe("pass");
  expect(evaluateORA07(O([t("oracle sqlnet.ora (internal)", "# none")])).status).toBe("fail");
});
it("ORA-08 logging off → fail, else pass, no listener → skip", () => {
  expect(evaluateORA08(O([t("oracle listener.ora (internal)", "LOGGING_LISTENER = OFF")])).status).toBe("fail");
  expect(evaluateORA08(O([t("oracle listener.ora (internal)", "LISTENER=(...)")])).status).toBe("pass");
  expect(evaluateORA08(O([t("oracle listener.ora (internal)", "__MISSING__")])).status).toBe("skip");
});
it("ORA-09 pfile audit_trail db → pass, none → fail, no pfile → review", () => {
  expect(evaluateORA09(O([t("oracle init pfile (internal)", "audit_trail = db")])).status).toBe("pass");
  expect(evaluateORA09(O([t("oracle init pfile (internal)", "audit_trail = none")])).status).toBe("fail");
  expect(evaluateORA09(O([t("oracle init pfile (internal)", "__MISSING__")])).status).toBe("review");
});
it("ORA-10 pfile remote_login_passwordfile EXCLUSIVE → pass, SHARED → fail, no pfile → review", () => {
  expect(evaluateORA10(O([t("oracle init pfile (internal)", "remote_login_passwordfile = EXCLUSIVE")])).status).toBe("pass");
  expect(evaluateORA10(O([t("oracle init pfile (internal)", "remote_login_passwordfile = SHARED")])).status).toBe("fail");
  expect(evaluateORA10(O([t("oracle init pfile (internal)", "__MISSING__")])).status).toBe("review");
});
it("ORA-11 → review, ORA-12 → review with version", () => {
  expect(evaluateORA11(O([])).status).toBe("review");
  const r = evaluateORA12(O([t("oracle version (internal)", "SQL*Plus: Release 19.0.0.0.0")]));
  expect(r.status).toBe("review");
  expect(r.evidence).toContain("19.0.0.0.0");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가:

```ts
export function evaluateORA07(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = oraValue(getOracleState(tasks).sqlnet, "SQLNET.ENCRYPTION_SERVER");
  const ok = v !== null && v !== "";
  return { id: "ORA-07", status: ok ? "pass" : "fail", evidence: ok ? `SQLNET.ENCRYPTION_SERVER: ${v}` : "SQLNET.ENCRYPTION_SERVER가 설정되어 있지 않음" };
}
export function evaluateORA08(tasks: AnsibleTaskOutput[]): CheckResult {
  const { listener } = getOracleState(tasks);
  if (!listener) return { id: "ORA-08", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  const off = oraHas(listener, /LOGGING_\w+\s*=\s*off/i);
  return { id: "ORA-08", status: off ? "fail" : "pass", evidence: off ? "리스너 로깅이 OFF로 설정됨" : "리스너 로깅이 비활성화되어 있지 않음" };
}
export function evaluateORA09(tasks: AnsibleTaskOutput[]): CheckResult {
  const { pfile } = getOracleState(tasks);
  if (!pfile) return { id: "ORA-09", status: "review", evidence: "init pfile을 확인할 수 없음(spfile 사용 가능) — audit_trail은 라이브 확인 필요(수동/AI)" };
  const v = oraValue(pfile, "audit_trail");
  const ok = v !== null && !/^(none|false)$/i.test(v);
  return { id: "ORA-09", status: ok ? "pass" : "fail", evidence: `audit_trail: ${v ?? "미설정"}` };
}
export function evaluateORA10(tasks: AnsibleTaskOutput[]): CheckResult {
  const { pfile } = getOracleState(tasks);
  if (!pfile) return { id: "ORA-10", status: "review", evidence: "init pfile을 확인할 수 없음(spfile 사용 가능) — remote_login_passwordfile은 라이브 확인 필요(수동/AI)" };
  const v = oraValue(pfile, "remote_login_passwordfile");
  const ok = v !== null && /^(exclusive|none)$/i.test(v);
  return { id: "ORA-10", status: ok ? "pass" : "fail", evidence: `remote_login_passwordfile: ${v ?? "미설정"}` };
}
export function evaluateORA11(): CheckResult {
  return { id: "ORA-11", status: "review", evidence: "기본 계정/권한(예: 기본 비밀번호, 과다 권한)은 라이브 SQL(dba_users) 확인이 필요 — 수동 점검" };
}
export function evaluateORA12(tasks: AnsibleTaskOutput[]): CheckResult {
  const version = getOracleState(tasks).version || "확인 불가";
  return { id: "ORA-12", status: "review", evidence: `Oracle 버전: ${version} — 정적 점검만으로 최신 패치(PSU/RU) 적용 여부를 단정할 수 없어 벤더 권고와 대조 필요` };
}
```

- [ ] **Step 4: 통과 + 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/dbOracle.ts src/lib/packs/dbOracle.test.ts
git commit -m "feat: db-oracle 평가기 ORA-07~12 (#db-oracle)"
```

---

## Task 5: 팩 조립 + 레지스트리 등록

**Files:** Modify `src/lib/packs/dbOracle.ts`, `src/lib/packs/registry.ts`, `src/lib/packs/registry.test.ts`, `src/lib/packs/resolve.test.ts`, `src/lib/packs/dbOracle.test.ts`

**Interfaces:** Produces `dbOraclePack: VendorPack`(itemIds=ORA-*); `ALL_PACKS` 등록.

- [ ] **Step 1: 실패 테스트** — `dbOracle.test.ts`에 추가 + registry/resolve 갱신:

```ts
import { dbOraclePack } from "./dbOracle";
import { getCatalogByCategory } from "@/lib/catalog";

it("dbOraclePack shape: ORA-* only, one result per item", () => {
  const oraIds = getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith("ORA-")).sort();
  expect(dbOraclePack.id).toBe("db-oracle");
  expect(dbOraclePack.vendors).toEqual(["Oracle"]);
  expect(dbOraclePack.itemIds.slice().sort()).toEqual(oraIds);
  expect(dbOraclePack.itemIds.every((id) => id.startsWith("ORA-"))).toBe(true);
  const present = [{ taskName: "oracle detection (internal)", stdout: "present" }];
  expect(dbOraclePack.evaluate({ findings: null, tasks: present }).map((r) => r.id).sort()).toEqual(oraIds);
  expect(dbOraclePack.detect(present)).toBe(true);
  expect(dbOraclePack.detect([])).toBe(false);
});
```
  `registry.test.ts`: `ALL_PACKS`에 `"db-oracle"` 추가; `findVendorPack("DB","Oracle")?.id === "db-oracle"` / 소문자.
  `resolve.test.ts`: `server+DB/Oracle → ["os-unix","db-oracle"]`, evidence에 `"oracle detection (internal)"`.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `dbOracle.ts` 하단:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import type { EvalContext, VendorPack } from "./types";

function evaluateOracle(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    evaluateORA01(t), evaluateORA02(t), evaluateORA03(t), evaluateORA04(t), evaluateORA05(t), evaluateORA06(t),
    evaluateORA07(t), evaluateORA08(t), evaluateORA09(t), evaluateORA10(t), evaluateORA11(), evaluateORA12(t),
  ];
}

export const dbOraclePack: VendorPack = {
  id: "db-oracle",
  category: "DB",
  vendors: ["Oracle"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith("ORA-")),
  evidenceTasks: ORACLE_EVIDENCE,
  detect: (tasks) => getOracleState(tasks).present,
  evaluate: evaluateOracle,
};
```
  `registry.ts`: `import { dbOraclePack } from "./dbOracle";` + `ALL_PACKS`에 추가.

- [ ] **Step 4: 통과 + 전체 스위트** — `npx vitest run` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/packs/dbOracle.ts src/lib/packs/registry.ts
git add src/lib/packs/dbOracle.ts src/lib/packs/registry.ts src/lib/packs/registry.test.ts src/lib/packs/resolve.test.ts src/lib/packs/dbOracle.test.ts
git commit -m "feat: db-oracle 팩 조립 + 레지스트리 등록 (#db-oracle)"
```

---

## Task 6: 실제 흐름 검증 (Docker Oracle-XE 최선노력, 불가 시 보류)

**Files:** (검증. 버그 발견 시 최소 수정 후 별도 커밋.)

- [ ] **Step 1: 전체 단위 테스트 그린** — `npx vitest run` PASS.
- [ ] **Step 2: Oracle-XE 기동 시도** — `docker run -d --name nhg-oracle -p 1521:1521 gvenzl/oracle-xe:slim` 등 시도. 컨테이너가 뜨고 SSH로 listener.ora/sqlnet.ora에 접근 가능하면 진행; **용량·아키텍처·라이선스로 안 뜨면 여기서 중단하고 "실제점검 보류(Oracle 대상 확보 시)"로 원장 기록** — 단위 테스트가 로직을 보장하며, negative/벤더분리 경로는 동일 엔진으로 이미 검증됨.
- [ ] **Step 3: (가능 시) positive** — packs = `os-oracle` 아님 `os-unix, db-oracle`, U-* + ORA-* 실제 pass/fail/review.
- [ ] **Step 4: 벤더 분리(항상 가능)** — 임의 Linux 서버를 `DB/Oracle`로 점검(Oracle 미설치) → packs=os-unix+db-oracle, ORA-* 전부 review("선언된 Oracle 미확인"), DB-*/PG-* 안 나옴. (실제 Oracle 없이도 분리·미탐지 경로 검증 가능.)
- [ ] **Step 5: 최종 게이트** — tsc·eslint·vitest 그린.

---

## Self-Review (완료)

- **스펙 커버리지:** 카탈로그(T1), 증거+파서(T2), ORA-01~12(T3/T4), 조립·등록(T5), E2E/보류(T6). review = ORA-11(SQL)·ORA-12(버전)·ORA-09/10(pfile 없으면).
- **벤더 분리:** db-oracle itemIds=ORA-* 프리픽스; db-mysql/db-postgresql 불변.
- **타입 일관성:** `getOracleState`/`oraValue`/`oraHas`/`oraActiveText`/`noGroupOtherWrite`, `evaluateORA01..12(tasks)`(ORA-11 zero-arg), `dbOraclePack`.
- **주의:** Oracle 설정 다양성(listener.ora paren 구문)으로 정규식 기반 판정이 근사적 — E2E(가능 시)·최종 리뷰에서 확인. 다중 glob `ls` 회피(루프+`[-f]`, PostgreSQL 교훈 반영). `sh -n` 필수. Oracle-XE 미기동은 블로커 아님(보류 처리).
