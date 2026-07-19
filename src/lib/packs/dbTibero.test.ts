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

  // --- CRITICAL: command-injection mitigation regression guard ---
  it("evidence raw commands shell-quote user inputs via Ansible's `quote` filter and drop the unquoted sh -c wrapper", () => {
    for (const t of tiberoPack.evidenceTasks) {
      expect(t.raw).toContain("| quote");
      expect(t.raw).not.toMatch(/sh -c '/);
    }
  });

  // --- previously-untested review branches ---
  it("TB-13 reviews (file not found) when tip content task returns MISSING with inputs provided", () => {
    const tasks = [task("TB-13: tibero tip content", MISSING)];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    const tb13 = r.find((x) => x.id === "TB-13")!;
    expect(tb13.status).toBe("review");
    expect(tb13.evidence).toContain("찾을 수 없음");
  });

  it("TB-14 reviews when required path inputs are missing", () => {
    const tasks = [task("TB-14: tibero tip perms", "tibero:tibero 600")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set() });
    expect(r.find((x) => x.id === "TB-14")!.status).toBe("review");
  });

  it("TB-14 reviews (file not found) when perms task returns MISSING with inputs provided", () => {
    const tasks = [task("TB-14: tibero tip perms", MISSING)];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-14")!.status).toBe("review");
  });

  // --- minor fixes ---
  it("TB-13 fails (not review) when .tip content is genuinely empty, not MISSING (empty file = no ACL)", () => {
    const tasks = [task("TB-13: tibero tip content", "")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-13")!.status).toBe("fail");
  });

  it("TB-14 reviews (fail-closed) when perms output doesn't parse to a valid mode", () => {
    const tasks = [task("TB-14: tibero tip perms", "tibero:tibero not-a-mode")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-14")!.status).toBe("review");
  });

  it("tbSQL evidence quotes user inputs and passes password via stdin CONN, not argv (#injection/#ps)", () => {
    const q = tiberoPack.evidenceTasks.find((t) => t.name === "TB-DB: tibero queries")!;
    expect(q.raw).toContain("{{ tibero_db_pass | quote }}");
    expect(q.raw).toContain("{{ tibero_tbsid | quote }}");
    expect(q.raw).toContain("CONN %s/%s@%s"); // stdin 경로
    // 비밀번호가 tbsql argv에 직접 붙지 않음: tbsql 호출은 -s /nolog 뿐
    expect(q.raw).toMatch(/tbsql -s \/nolog/);
    expect(q.raw).not.toMatch(/tbsql[^\n]*\$p/); // argv에 비번 변수 없음
  });

  // --- regression: v$parameter must survive shell expansion on the target ---
  it("TB-11/TB-12 query escapes v$parameter so the shell doesn't expand $parameter as an unset variable", () => {
    const q = tiberoPack.evidenceTasks.find((t) => t.name === "TB-DB: tibero queries")!;
    // JS-level string must contain a literal backslash before $ (i.e. `\$parameter`),
    // so the rendered shell command sees `v\$parameter` and passes `v$parameter`
    // through to tbsql untouched instead of the shell expanding `$parameter` (unset → "").
    expect(q.raw).toContain("v\\$parameter");
  });

  it("TB-13 fails when LSNR_INVITED_IP is present but has no value (not actually configured)", () => {
    const tasks = [task("TB-13: tibero tip content", "LSNR_INVITED_IP=\n")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-13")!.status).toBe("fail");
  });

  it("TB-13 fails when empty ACL followed by another directive on next line (regex scope bug)", () => {
    const tasks = [task("TB-13: tibero tip content", "LSNR_INVITED_IP=\nMAX_SESSION_COUNT=100\n")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-13")!.status).toBe("fail");
  });
});

function dbTasks(login: string, queries: string) {
  return [
    { taskName: "TB-DB: tibero sys default login", stdout: login },
    { taskName: "TB-DB: tibero queries", stdout: queries },
  ];
}
const PROVIDED = new Set(["tibero_home", "tibero_tbsid", "tibero_db_user", "tibero_db_pass"]);

describe("tiberoPack DB checks (TB-01~12)", () => {
  it("reviews all DB items when credentials are missing", () => {
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("", ""), inputsProvided: new Set(["tibero_home","tibero_tbsid"]) });
    for (const id of ["TB-01","TB-03","TB-05","TB-11"]) expect(r.find((x) => x.id === id)!.status).toBe("review");
  });

  it("reviews DB items when tbSQL connection failed (no __CONN_OK__)", () => {
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", "TBR-12345: login denied"), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-05")!.status).toBe("review");
    expect(r.find((x) => x.id === "TB-05")!.evidence).toContain("DB 인증 실패");
  });

  it("TB-02 fails when SYS default password login succeeds", () => {
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW__", "__CONN_OK__\n###TB01\n###TB03\n###TB04\n###TBPROF\n###TB11\n"), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-02")!.status).toBe("fail");
  });

  it("TB-05 fails when FAILED_LOGIN_ATTEMPTS is UNLIMITED (default profile)", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\n###TB03\n###TB04\n###TBPROF\nDEFAULT|FAILED_LOGIN_ATTEMPTS|UNLIMITED\nDEFAULT|PASSWORD_LIFE_TIME|90\n###TB11\naudit_trail|DB\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-05")!.status).toBe("fail");
    expect(r.find((x) => x.id === "TB-07")!.status).toBe("pass"); // 90일 → 양호
  });

  it("TB-11 fails when audit_trail is NONE", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\n###TB03\n###TB04\n###TBPROF\nDEFAULT|FAILED_LOGIN_ATTEMPTS|5\n###TB11\naudit_trail|NONE\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-11")!.status).toBe("fail");
    expect(r.find((x) => x.id === "TB-05")!.status).toBe("pass"); // 5 → 양호
  });

  it("TB-03 fails when a non-SYS account has DBA role", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\n###TB03\nAPPUSER\n###TB04\n###TBPROF\n###TB11\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-03")!.status).toBe("fail");
  });

  // --- fail-closed gap: empty TB01 with __CONN_OK__ means the query batch didn't
  // actually run (DBA_USERS always returns >=1 row when the session works), so an
  // empty TB01 section must NOT be read as "no default accounts / pass".
  it("reviews TB-01 AND TB-03~12 when __CONN_OK__ is present but ###TB01 section is empty (query batch untrustworthy)", () => {
    const queries = "__CONN_OK__\n###TB01\n###TB03\n###TB04\n###TBPROF\n###TB11\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    for (const id of ["TB-01", "TB-05", "TB-11"]) {
      const item = r.find((x) => x.id === id)!;
      expect(item.status).toBe("review");
      expect(item.evidence).toContain("DB 조회 결과 없음");
    }
  });

  it("TB-10 reviews when SESSIONS_PER_USER is UNLIMITED (queries did run, TB01 has a row)", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\n###TB03\n###TB04\n###TBPROF\nDEFAULT|SESSIONS_PER_USER|UNLIMITED\n###TB11\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-10")!.status).toBe("review");
  });

  it("TB-12 reviews when audit_sys_operations is N (queries did run, TB01 has a row)", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\n###TB03\n###TB04\n###TBPROF\n###TB11\naudit_sys_operations|N\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-12")!.status).toBe("review");
  });

  // --- TB-01: SYS must be excluded from the default-account OPEN check ---
  // SYS cannot be locked and is legitimately OPEN in every working instance, so
  // treating SYS|OPEN as a fail would make TB-01 a near-universal false positive.
  it("TB-01 passes when only SYS is OPEN (SYS is excluded from the default-account check)", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\n###TB03\n###TB04\n###TBPROF\n###TB11\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-01")!.status).toBe("pass");
  });

  it("TB-01 fails when a real unused default account (OUTLN) is OPEN", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\nOUTLN|OPEN\n###TB03\n###TB04\n###TBPROF\n###TB11\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    const tb01 = r.find((x) => x.id === "TB-01")!;
    expect(tb01.status).toBe("fail");
    expect(tb01.evidence).toContain("OUTLN");
    expect(tb01.evidence).not.toContain("SYS"); // SYS itself must not be reported as an offending default account
  });
});
