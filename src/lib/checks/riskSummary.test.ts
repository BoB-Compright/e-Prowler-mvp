import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { saveCheckResults } from "./store";
import { computeRiskSummary, overallRunOutcome } from "./riskSummary";
import { getRunRiskSummary } from "./riskSummaryStore";

describe("computeRiskSummary", () => {
  it("tallies status counts and severity counts for failed items only", () => {
    const summary = computeRiskSummary([
      { status: "fail", severity: "Critical" },
      { status: "fail", severity: "High" },
      { status: "review", severity: "Medium" },
      { status: "pass", severity: null },
      { status: "skip", severity: null },
    ]);

    expect(summary.total).toBe(5);
    expect(summary.statusCounts).toEqual({
      pass: 1,
      fail: 2,
      review: 1,
      skip: 1,
      not_automated: 0,
    });
    // "review" and "pass" items don't count toward the severity breakdown —
    // only confirmed ("fail") vulnerabilities do.
    expect(summary.severityCounts).toEqual({ Critical: 1, High: 1, Medium: 0, Low: 0 });
  });

  it("returns all-zero counts for an empty list", () => {
    const summary = computeRiskSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.statusCounts.pass).toBe(0);
    expect(summary.severityCounts.Critical).toBe(0);
  });

  it("counts an AI-adjudicated (review→fail) item as fail, not review", () => {
    const summary = computeRiskSummary([
      { status: "fail", severity: "High" }, // AI가 review→fail로 갱신한 항목도 결국 status=fail로 집계
      { status: "review", severity: null },
    ]);
    expect(summary.statusCounts.fail).toBe(1);
    expect(summary.statusCounts.review).toBe(1);
  });
});

describe("overallRunOutcome", () => {
  it("prefers fail over review over pass", () => {
    expect(overallRunOutcome(computeRiskSummary([{ status: "fail", severity: "Low" }]))).toBe(
      "fail",
    );
    expect(overallRunOutcome(computeRiskSummary([{ status: "review", severity: "Low" }]))).toBe(
      "review",
    );
    expect(overallRunOutcome(computeRiskSummary([{ status: "pass", severity: null }]))).toBe(
      "pass",
    );
    expect(overallRunOutcome(computeRiskSummary([]))).toBe("pass");
  });
});

describe("getRunRiskSummary", () => {
  let db: Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  it("joins stored check results with catalog severity", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    saveCheckResults(
      run.id,
      [
        { id: "C-01", status: "fail", evidence: "uid 0" },
        { id: "C-02", status: "pass", evidence: "no secrets" },
      ],
      db,
    );

    const summary = getRunRiskSummary(run.id, db);
    expect(summary.total).toBe(2);
    expect(summary.statusCounts.fail).toBe(1);
    expect(summary.statusCounts.pass).toBe(1);
    // C-01 (root/UID 0) is a High-severity catalog item.
    expect(summary.severityCounts.High).toBe(1);
  });
});
