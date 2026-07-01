import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { listCheckResults, saveCheckResults } from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("check result store", () => {
  it("round-trips check results for a run in insertion order", () => {
    const run = createRun("https://github.com/owner/repo.git", db);
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
      { id: "C-01", status: "fail", evidence: "uid 0" },
      { id: "C-02", status: "pass", evidence: "no secrets" },
      { id: "U-16", status: "skip", evidence: "no /etc/passwd" },
    ]);
  });

  it("returns an empty array for a run with no check results", () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    expect(listCheckResults(run.id, db)).toEqual([]);
  });

  it("keeps results scoped to their own run", () => {
    const runA = createRun("https://github.com/owner/a.git", db);
    const runB = createRun("https://github.com/owner/b.git", db);
    saveCheckResults(runA.id, [{ id: "C-01", status: "pass", evidence: "ok" }], db);

    expect(listCheckResults(runB.id, db)).toEqual([]);
  });
});
