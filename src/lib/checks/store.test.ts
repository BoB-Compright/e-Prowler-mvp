import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { getCatalogItem } from "@/lib/catalog";
import { listCheckResults, saveCheckResults, updateCheckVerdict } from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("check result store", () => {
  it("round-trips check results for a run in insertion order", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    saveCheckResults(
      run.id,
      [
        { id: "C-01", status: "fail", evidence: "uid 0" },
        { id: "C-02", status: "pass", evidence: "no secrets" },
        { id: "U-16", status: "skip", evidence: "no /etc/passwd" },
      ],
      db,
    );

    expect(listCheckResults(run.id, db)).toEqual([
      { id: "C-01", status: "fail", evidence: "uid 0", frameworkId: "kisa", source: "rule" },
      { id: "C-02", status: "pass", evidence: "no secrets", frameworkId: "kisa", source: "rule" },
      { id: "U-16", status: "skip", evidence: "no /etc/passwd", frameworkId: "kisa", source: "rule" },
    ]);
  });

  it("returns an empty array for a run with no check results", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    expect(listCheckResults(run.id, db)).toEqual([]);
  });

  it("keeps results scoped to their own run", () => {
    const runA = createRun("https://github.com/owner/a.git", "git", null, db);
    const runB = createRun("https://github.com/owner/b.git", "git", null, db);
    saveCheckResults(runA.id, [{ id: "C-01", status: "pass", evidence: "ok" }], db);

    expect(listCheckResults(runB.id, db)).toEqual([]);
  });

  it("persists frameworkId looked up from the catalog", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    saveCheckResults(run.id, [{ id: "U-16", status: "pass", evidence: "e" }], db);
    const row = db
      .prepare(`SELECT framework_id FROM check_results WHERE item_id = 'U-16'`)
      .get() as { framework_id: string };
    expect(row.framework_id).toBe(getCatalogItem("U-16")!.frameworkId);
  });

  it("saves source='rule' by default and updateCheckVerdict flips to ai", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    saveCheckResults(run.id, [{ id: "U-16", status: "review", evidence: "e" }], db);
    expect(listCheckResults(run.id, db)[0].source).toBe("rule");
    updateCheckVerdict(run.id, "U-16", "fail", db);
    const row = listCheckResults(run.id, db)[0];
    expect(row.status).toBe("fail");
    expect(row.source).toBe("ai");
  });
});
