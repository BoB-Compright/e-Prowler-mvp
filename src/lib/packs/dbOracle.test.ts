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
