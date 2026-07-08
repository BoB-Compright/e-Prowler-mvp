import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { analyzeAndSaveChecks } from "./index";
import { listAnalysisReports } from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("analyzeAndSaveChecks", () => {
  it("is a no-op unless CLAUDE_ANALYSIS_ENABLED=true, to avoid burning API tokens by default", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    // This id has no catalog entry, which would throw if analysis actually
    // ran — proving the gate short-circuits before any lookup or API call.
    await expect(
      analyzeAndSaveChecks(run.id, [{ id: "NOT-IN-CATALOG", status: "fail", evidence: "x" }], db),
    ).resolves.toBeUndefined();
    expect(listAnalysisReports(run.id, db)).toEqual([]);
  });
});
