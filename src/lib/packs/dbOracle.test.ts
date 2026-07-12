import { describe, expect, it } from "vitest";
import { ORACLE_EVIDENCE, getOracleState, oraValue, oraHas, evaluateORA01, evaluateORA02, evaluateORA03, evaluateORA04, evaluateORA05, evaluateORA06, evaluateORA07, evaluateORA08, evaluateORA09, evaluateORA10, evaluateORA11, evaluateORA12 } from "./dbOracle";

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

const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const O = (extra: { taskName: string; stdout: string }[]) => [t("oracle detection (internal)", "present"), ...extra];

describe("evaluators ORA-01~06", () => {
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
});

describe("evaluators ORA-07~12", () => {
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
    expect(evaluateORA11().status).toBe("review");
    const r = evaluateORA12(O([t("oracle version (internal)", "SQL*Plus: Release 19.0.0.0.0")]));
    expect(r.status).toBe("review");
    expect(r.evidence).toContain("19.0.0.0.0");
  });
});
