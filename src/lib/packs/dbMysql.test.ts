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
