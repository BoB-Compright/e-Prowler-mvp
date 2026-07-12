import { describe, expect, it } from "vitest";
import { MYSQL_EVIDENCE, getMysqlState, cnfValue, cnfHasFlag, evaluateDB01, evaluateDB02, evaluateDB03, evaluateDB04, evaluateDB05, evaluateDB06, evaluateDB07, evaluateDB08, evaluateDB09, evaluateDB10, evaluateDB11, evaluateDB12 } from "./dbMysql";

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

const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const D = (extra: { taskName: string; stdout: string }[]) => [t("mysql detection (internal)", "present"), ...extra];

describe("evaluators DB-01..06", () => {
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
});

describe("evaluators DB-07..12", () => {
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
});
