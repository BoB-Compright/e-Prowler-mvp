import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import {
  appendEvent,
  cancelRun,
  createRun,
  getRun,
  isCancelled,
  listRunEvents,
  listRuns,
  markRunFinished,
  markRunStarted,
  markRunTriggerType,
  updateRunStage,
} from "./runs";

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

describe("cancelRun (#73)", () => {
  it("marks a running run cancelled without touching its current stage, and records an event", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    updateRunStage(run.id, "sandbox", "running", {}, db);

    const cancelled = cancelRun(run.id, "사용자가 점검을 취소했습니다", db);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.stage).toBe("sandbox"); // stage untouched — only status flips

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");

    const events = listRunEvents(run.id, db);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.status).toBe("cancelled");
    expect(lastEvent.stage).toBe("sandbox");
    expect(lastEvent.message).toBe("사용자가 점검을 취소했습니다");
  });

  it("isCancelled reflects the persisted status", () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    expect(isCancelled(run.id, db)).toBe(false);

    cancelRun(run.id, "취소", db);

    expect(isCancelled(run.id, db)).toBe(true);
  });
});

describe("run duration timestamps", () => {
  it("createRun은 started_at/finished_at을 null로 둔다 (큐 대기 제외)", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    const row = getRun(run.id, db)!;
    expect(row.startedAt).toBeNull();
    expect(row.finishedAt).toBeNull();
  });

  it("markRunStarted는 첫 값만 기록(idempotent)", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    markRunStarted(run.id, db);
    const first = getRun(run.id, db)!.startedAt;
    expect(first).not.toBeNull();
    markRunStarted(run.id, db);
    expect(getRun(run.id, db)!.startedAt).toBe(first);
  });

  it("종료 전이(done/succeeded)에서 finished_at 기록", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    expect(getRun(run.id, db)!.finishedAt).toBeNull();
    updateRunStage(run.id, "done", "succeeded", {}, db);
    expect(getRun(run.id, db)!.finishedAt).not.toBeNull();
  });

  it("실패 전이에서도 finished_at 기록", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    updateRunStage(run.id, "build", "failed", { errorMessage: "boom" }, db);
    expect(getRun(run.id, db)!.finishedAt).not.toBeNull();
  });

  it("markRunFinished는 첫 값만 기록(idempotent)", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    markRunFinished(run.id, db);
    const first = getRun(run.id, db)!.finishedAt;
    updateRunStage(run.id, "done", "succeeded", {}, db);
    expect(getRun(run.id, db)!.finishedAt).toBe(first);
  });

  it("cancelRun은 finished_at 기록", () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    cancelRun(run.id, "사용자 취소", db);
    expect(getRun(run.id, db)!.finishedAt).not.toBeNull();
  });
});
