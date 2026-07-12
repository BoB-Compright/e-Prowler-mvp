import { describe, expect, it } from "vitest";
import { PG_EVIDENCE, getPgState, pgValue, pgBool, evaluatePG01, evaluatePG02, evaluatePG03, evaluatePG04, evaluatePG05, evaluatePG06, evaluatePG07, evaluatePG08, evaluatePG09, evaluatePG10, evaluatePG11, evaluatePG12, dbPostgresPack } from "./dbPostgres";
import { getCatalogByCategory } from "@/lib/catalog";

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

const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const P = (extra: { taskName: string; stdout: string }[]) => [t("postgres detection (internal)", "present"), ...extra];

describe("evaluators PG-01~06", () => {
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
});

describe("evaluators PG-07~12", () => {
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
    expect(evaluatePG11().status).toBe("review");
    const r = evaluatePG12(P([t("postgres version (internal)", "postgres (PostgreSQL) 16.3")]));
    expect(r.status).toBe("review");
    expect(r.evidence).toContain("16.3");
  });
});

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
