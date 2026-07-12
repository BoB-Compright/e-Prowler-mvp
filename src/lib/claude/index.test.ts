import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { saveCheckResults, listCheckResults } from "@/lib/checks/store";
import { analyzeAndSaveChecks } from "./index";
import { listAnalysisReports } from "./store";
import type { ClaudeAnalysis } from "./schema";

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

  it("adjudicates review→fail (source ai), leaves rule pass/fail untouched", async () => {
    process.env.CLAUDE_ANALYSIS_ENABLED = "true";
    const run = createRun("https://github.com/o/r.git", "git", null, db);
    saveCheckResults(run.id, [
      { id: "U-16", status: "review", evidence: "e1" },
      { id: "U-18", status: "fail", evidence: "e2" },
    ], db);
    const fakeReport = (id: string, verdict: ClaudeAnalysis["verdict"]): ClaudeAnalysis => ({
      id, status: "review", severity: "Medium", verdict,
      title: "t", evidence: "e", reason: "r", remediation: "m", example: "x",
    });
    const analyze = async ({ result }: { result: { id: string; status: string } }) =>
      result.id === "U-16" ? fakeReport("U-16", "fail") : fakeReport("U-18", "fail");
    await analyzeAndSaveChecks(run.id, [
      { id: "U-16", status: "review", evidence: "e1" },
      { id: "U-18", status: "fail", evidence: "e2" },
    ], db, { analyze });
    const rows = Object.fromEntries(listCheckResults(run.id, db).map((r) => [r.id, r]));
    expect(rows["U-16"].status).toBe("fail");
    expect(rows["U-16"].source).toBe("ai");
    // U-18은 룰이 이미 fail → AI가 뭘 반환하든 rule 유지
    expect(rows["U-18"].status).toBe("fail");
    expect(rows["U-18"].source).toBe("rule");
    delete process.env.CLAUDE_ANALYSIS_ENABLED;
  });
});
