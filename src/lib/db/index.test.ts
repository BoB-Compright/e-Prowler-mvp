import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "./index";

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
