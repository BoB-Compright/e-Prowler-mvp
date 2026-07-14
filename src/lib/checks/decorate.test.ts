import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import { saveCheckResults } from "@/lib/checks/store";
import { getDecoratedResults } from "./decorate";

let db: Database;
beforeEach(() => { db = createInMemoryDb(); });

describe("getDecoratedResults", () => {
  it("check_results를 카탈로그 메타(title/severity/category/framework)로 데코한다", () => {
    const run = createRun("127.0.0.1", "server", null, db);
    saveCheckResults(run.id, [{ id: "U-01", status: "pass", evidence: "PermitRootLogin prohibit-password" }], db);
    const decorated = getDecoratedResults(run.id, db);
    const u01 = decorated.find((d) => d.id === "U-01")!;
    expect(u01.title.length).toBeGreaterThan(0);
    expect(u01.category).toBe("unix");
    expect(u01.severity).toBeTruthy();
    expect(u01.evidence).toContain("PermitRootLogin");
    expect(u01).toHaveProperty("reason"); // 분석 리포트 없으면 null
    expect(u01).toHaveProperty("mitigation");
  });
  it("빈 run은 빈 배열", () => {
    const run = createRun("127.0.0.1", "server", null, db);
    expect(getDecoratedResults(run.id, db)).toEqual([]);
  });
});
