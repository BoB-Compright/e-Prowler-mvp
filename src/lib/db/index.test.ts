import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createInMemoryDb, migrate, SCHEMA } from "./index";

describe("schema", () => {
  it("creates projects and assets tables with runs.asset_id column", () => {
    const db = createInMemoryDb();

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain("projects");
    expect(tables).toContain("assets");

    const runColumns = db
      .prepare(`PRAGMA table_info(runs)`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(runColumns).toContain("asset_id");
  });

  it("creates scan_batches table with runs.batch_id column", () => {
    const db = createInMemoryDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("scan_batches");
    const runColumns = db
      .prepare(`PRAGMA table_info(runs)`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(runColumns).toContain("batch_id");
  });

  it("creates installed_packages, cve_matches, nvd_query_cache tables", () => {
    const db = createInMemoryDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain("installed_packages");
    expect(tables).toContain("cve_matches");
    expect(tables).toContain("nvd_query_cache");
  });

  it("creates schedules table with runs.trigger_type column", () => {
    const db = createInMemoryDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain("schedules");

    const runColumns = db
      .prepare(`PRAGMA table_info(runs)`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(runColumns).toContain("trigger_type");

    const scheduleColumns = db
      .prepare(`PRAGMA table_info(schedules)`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(scheduleColumns).toEqual([
      "id", "asset_id", "frequency", "day_of_week", "day_of_month", "time_of_day",
      "enabled", "next_run_at", "last_run_at", "last_skip_reason", "created_at", "updated_at",
    ]);
  });
});

describe("scan_batches nullable migration on existing data", () => {
  // 회귀: better-sqlite3는 foreign_keys를 기본 ON으로 켠다. runs.batch_id가
  // scan_batches를 참조하는 기존 DB에서 project_id를 nullable로 재구축할 때
  // DROP TABLE이 FK 제약으로 실패했다(빈 :memory: DB에는 참조 run이 없어
  // 드러나지 않았고, 실서버 앱이 매 요청 500으로 다운됐다).
  function oldSchemaDb(): Database.Database {
    const db = new Database(":memory:");
    // better-sqlite3 기본값 재확인 (이 테스트의 전제)
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.exec(SCHEMA);
    // 기존 DB는 batch_id 마이그레이션을 이미 거친 상태 — 그 상태를 재현
    db.exec(`ALTER TABLE runs ADD COLUMN batch_id TEXT REFERENCES scan_batches(id)`);
    db.exec(`ALTER TABLE runs ADD COLUMN asset_id TEXT REFERENCES assets(id)`);
    return db;
  }

  function projectIdNotNull(db: Database.Database): number {
    return (db.prepare(`PRAGMA table_info(scan_batches)`).all() as { name: string; notnull: number }[])
      .find((c) => c.name === "project_id")!.notnull;
  }

  it("scan_batches를 참조하는 run이 있어도 마이그레이션이 성공하고 데이터·FK 무결성을 보존한다", () => {
    const db = oldSchemaDb();
    db.prepare(`INSERT INTO projects (id, name, pm_name, pm_email, share_token, share_password_hash, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run("p1", "proj", "pm", "pm@x.com", "tok", "hash", "2026-07-11T00:00:00.000Z");
    db.prepare(`INSERT INTO scan_batches (id, project_id, created_at) VALUES (?,?,?)`)
      .run("b1", "p1", "2026-07-11T00:00:00.000Z");
    db.prepare(`INSERT INTO runs (id, repo_url, stage, status, created_at, updated_at, batch_id) VALUES (?,?,?,?,?,?,?)`)
      .run("r1", "https://x/r", "done", "succeeded", "2026-07-11T00:00:00.000Z", "2026-07-11T00:00:00.000Z", "b1");

    expect(() => migrate(db)).not.toThrow();

    expect(projectIdNotNull(db)).toBe(0); // nullable로 전환됨
    expect(db.prepare(`SELECT project_id FROM scan_batches WHERE id = ?`).get("b1")).toEqual({ project_id: "p1" });
    // runs.batch_id가 여전히 scan_batches를 정확히 참조하고 FK 위반이 없어야 한다
    const runFkTables = (db.pragma("foreign_key_list(runs)") as { table: string }[]).map((f) => f.table);
    expect(runFkTables).toContain("scan_batches");
    expect(db.pragma("foreign_key_check")).toEqual([]);
    // project_id NULL 배치(자산 선택 일괄 점검)를 이제 넣을 수 있다
    expect(() =>
      db.prepare(`INSERT INTO scan_batches (id, project_id, created_at) VALUES ('b2', NULL, 't')`).run(),
    ).not.toThrow();
    // 재구축 후 FK 강제가 다시 켜져 있어야 한다
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("예전 버그로 남은 scan_batches_new 잔여 테이블이 있어도 성공한다 (재발 크래시 방지)", () => {
    const db = oldSchemaDb();
    db.prepare(`INSERT INTO projects (id, name, pm_name, pm_email, share_token, share_password_hash, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run("p1", "proj", "pm", "pm@x.com", "tok", "hash", "2026-07-11T00:00:00.000Z");
    db.prepare(`INSERT INTO scan_batches (id, project_id, created_at) VALUES (?,?,?)`)
      .run("b1", "p1", "2026-07-11T00:00:00.000Z");
    // 이전 실패 마이그레이션이 남긴 잔여 테이블을 시뮬레이션
    db.exec(`CREATE TABLE scan_batches_new (id TEXT PRIMARY KEY, project_id TEXT, created_at TEXT NOT NULL)`);

    // "table scan_batches_new already exists"로 크래시하지 않고 마이그레이션이 완료돼야 한다
    expect(() => migrate(db)).not.toThrow();
    expect(projectIdNotNull(db)).toBe(0);
    expect(db.prepare(`SELECT project_id FROM scan_batches WHERE id = ?`).get("b1")).toEqual({ project_id: "p1" });
  });
});
