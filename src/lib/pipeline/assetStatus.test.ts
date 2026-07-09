import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset } from "@/lib/assets/store";
import { createRun, updateRunStage } from "./runs";
import { saveCheckResults } from "@/lib/checks/store";
import { getAssetStatusMap } from "./assetStatus";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getAssetStatusMap", () => {
  it("returns 'none' for an asset with no runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);

    const map = getAssetStatusMap(db);

    expect(map.get(asset.id)).toEqual({ kind: "none" });
  });

  it("returns 'running' for an asset whose latest run is still in progress", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun("https://github.com/x/a", "git", asset.id, db);

    const map = getAssetStatusMap(db);

    expect(map.get(asset.id)).toEqual({ kind: "running", runId: run.id });
  });

  it("returns 'error' (not 'fail') when the pipeline run itself failed", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun("https://github.com/x/a", "git", asset.id, db);
    updateRunStage(run.id, "build", "failed", { errorMessage: "docker build exited 1" }, db);

    const map = getAssetStatusMap(db);

    expect(map.get(asset.id)).toEqual({ kind: "error", runId: run.id });
  });

  it("returns 'fail' when the run succeeded but checks found a vulnerability", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun("https://github.com/x/a", "git", asset.id, db);
    saveCheckResults(run.id, [{ id: "C-01", status: "fail", evidence: "uid 0" }], db);
    updateRunStage(run.id, "done", "succeeded", {}, db);

    const map = getAssetStatusMap(db);

    expect(map.get(asset.id)).toEqual({ kind: "fail", runId: run.id });
  });

  it("returns 'review' when the run succeeded but checks need review", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun("https://github.com/x/a", "git", asset.id, db);
    saveCheckResults(run.id, [{ id: "C-02", status: "review", evidence: "needs manual look" }], db);
    updateRunStage(run.id, "done", "succeeded", {}, db);

    const map = getAssetStatusMap(db);

    expect(map.get(asset.id)).toEqual({ kind: "review", runId: run.id });
  });

  it("returns 'pass' when the run succeeded and all checks passed", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun("https://github.com/x/a", "git", asset.id, db);
    saveCheckResults(run.id, [{ id: "C-02", status: "pass", evidence: "ok" }], db);
    updateRunStage(run.id, "done", "succeeded", {}, db);

    const map = getAssetStatusMap(db);

    expect(map.get(asset.id)).toEqual({ kind: "pass", runId: run.id });
  });

  it("uses the latest run when an asset has multiple runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const oldRun = createRun("https://github.com/x/a", "git", asset.id, db);
    saveCheckResults(oldRun.id, [{ id: "C-01", status: "fail", evidence: "uid 0" }], db);
    updateRunStage(oldRun.id, "done", "succeeded", {}, db);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const newRun = createRun("https://github.com/x/a", "git", asset.id, db);
    saveCheckResults(newRun.id, [{ id: "C-02", status: "pass", evidence: "ok" }], db);
    updateRunStage(newRun.id, "done", "succeeded", {}, db);

    const map = getAssetStatusMap(db);

    expect(map.get(asset.id)).toEqual({ kind: "pass", runId: newRun.id });
  });
});
