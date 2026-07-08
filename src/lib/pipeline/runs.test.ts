import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { appendEvent, createRun, getRun, listRunEvents, listRuns, markRunTriggerType, updateRunStage } from "./runs";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("run store", () => {
  it("creates a run in the clone/running state with an initial event", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    expect(run.stage).toBe("clone");
    expect(run.status).toBe("running");
    expect(run.imageTag).toBeNull();

    expect(getRun(run.id, db)).toEqual(run);
    expect(listRunEvents(run.id, db)).toHaveLength(1);
  });

  it("updates stage/status and records image tag on success", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    updateRunStage(run.id, "clone", "succeeded", {}, db);
    updateRunStage(run.id, "build", "running", {}, db);
    updateRunStage(run.id, "build", "succeeded", { imageTag: "scan-abc" }, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("succeeded");
    expect(updated.imageTag).toBe("scan-abc");

    expect(listRunEvents(run.id, db)).toHaveLength(4);
  });

  it("records an error message on failure", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    updateRunStage(run.id, "build", "failed", { errorMessage: "docker build exited 1" }, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("docker build exited 1");
  });

  it("lists runs newest first", () => {
    const a = createRun("https://github.com/owner/a.git", "git", null, db);
    appendEvent(a.id, "clone", "running", "note", db);
    const b = createRun("https://github.com/owner/b.git", "git", null, db);

    const ids = listRuns(db).map((r) => r.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it("defaults assetId to null when not provided", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    expect(run.assetId).toBeNull();
    expect(getRun(run.id, db)!.assetId).toBeNull();
  });

  it("persists and round-trips an assetId through create/get/list", () => {
    db.exec(`INSERT INTO assets (id, type, display_name, created_at)
             VALUES ('asset-1', 'repo', 'a', '2024-01-01')`);

    const run = createRun("https://github.com/owner/repo.git", "git", "asset-1", db);
    expect(run.assetId).toBe("asset-1");

    const fetched = getRun(run.id, db);
    expect(fetched?.assetId).toBe("asset-1");

    const listed = listRuns(db).find((r) => r.id === run.id);
    expect(listed?.assetId).toBe("asset-1");
  });

  it("defaults triggerType to manual and can be marked scheduled", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    expect(run.triggerType).toBe("manual");

    markRunTriggerType(run.id, "scheduled", db);

    expect(getRun(run.id, db)!.triggerType).toBe("scheduled");
  });
});
