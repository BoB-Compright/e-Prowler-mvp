import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createProject } from "@/lib/projects/store";
import { createRun } from "@/lib/pipeline/runs";
import { createScanBatch, listRunsByBatch } from "./scanBatches";

let db: Database;
beforeEach(() => {
  db = createInMemoryDb();
});

describe("scan batches", () => {
  it("groups runs sharing a batch id", () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const batch = createScanBatch(project.id, db);
    const r1 = createRun("10.0.0.1", "server", null, db);
    const r2 = createRun("10.0.0.2", "server", null, db);
    db.prepare(`UPDATE runs SET batch_id = ? WHERE id IN (?, ?)`).run(batch.id, r1.id, r2.id);
    expect(listRunsByBatch(batch.id, db)).toHaveLength(2);
  });

  it("does not include runs from a different batch", () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const batchA = createScanBatch(project.id, db);
    const batchB = createScanBatch(project.id, db);
    const r1 = createRun("10.0.0.1", "server", null, db);
    const r2 = createRun("10.0.0.2", "server", null, db);
    db.prepare(`UPDATE runs SET batch_id = ? WHERE id = ?`).run(batchA.id, r1.id);
    db.prepare(`UPDATE runs SET batch_id = ? WHERE id = ?`).run(batchB.id, r2.id);
    expect(listRunsByBatch(batchA.id, db).map((r) => r.id)).toEqual([r1.id]);
  });
});
