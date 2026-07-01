import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { appendEvent, createRun, getRun, listRunEvents, listRuns, updateRunStage } from "./runs";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("run store", () => {
  it("creates a run in the clone/running state with an initial event", () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    expect(run.stage).toBe("clone");
    expect(run.status).toBe("running");
    expect(run.imageTag).toBeNull();

    expect(getRun(run.id, db)).toEqual(run);
    expect(listRunEvents(run.id, db)).toHaveLength(1);
  });

  it("updates stage/status and records image tag on success", () => {
    const run = createRun("https://github.com/owner/repo.git", db);
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
    const run = createRun("https://github.com/owner/repo.git", db);
    updateRunStage(run.id, "build", "failed", { errorMessage: "docker build exited 1" }, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("docker build exited 1");
  });

  it("lists runs newest first", () => {
    const a = createRun("https://github.com/owner/a.git", db);
    appendEvent(a.id, "clone", "running", "note", db);
    const b = createRun("https://github.com/owner/b.git", db);

    const ids = listRuns(db).map((r) => r.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });
});
