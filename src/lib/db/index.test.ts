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
});
