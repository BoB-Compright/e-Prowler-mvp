import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { listAnalysisReports, saveAnalysisReport } from "./store";
import type { ClaudeAnalysis } from "./schema";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

function report(overrides: Partial<ClaudeAnalysis> = {}): ClaudeAnalysis {
  return {
    id: "C-01",
    status: "fail",
    severity: "High",
    title: "컨테이너가 root 사용자로 실행됨",
    evidence: "Container runtime UID is 0",
    reason: "root 권한으로 실행되면 침해 시 위험이 커집니다",
    remediation: "Dockerfile에 USER 지시어를 추가하세요",
    example: "RUN useradd -r appuser\nUSER appuser",
    ...overrides,
  };
}

describe("analysis report store", () => {
  it("round-trips a saved report", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    saveAnalysisReport(run.id, report(), db);

    expect(listAnalysisReports(run.id, db)).toEqual([
      {
        itemId: "C-01",
        title: "컨테이너가 root 사용자로 실행됨",
        reason: "root 권한으로 실행되면 침해 시 위험이 커집니다",
        remediation: "Dockerfile에 USER 지시어를 추가하세요",
        example: "RUN useradd -r appuser\nUSER appuser",
      },
    ]);
  });

  it("keeps reports scoped to their own run", () => {
    const runA = createRun("https://github.com/owner/a.git", "git", null, db);
    const runB = createRun("https://github.com/owner/b.git", "git", null, db);
    saveAnalysisReport(runA.id, report(), db);

    expect(listAnalysisReports(runB.id, db)).toEqual([]);
  });
});
