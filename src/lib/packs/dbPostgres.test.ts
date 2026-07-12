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
