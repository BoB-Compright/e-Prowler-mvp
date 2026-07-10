import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset, createServerAsset } from "@/lib/assets/store";
import { cancelRun, createRun, getRun, updateRunStage } from "@/lib/pipeline/runs";
import { hasActiveRun, triggerRunForAsset, type TriggerDeps } from "./trigger";

let db: Database;

beforeEach(() => {
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
  db = createInMemoryDb();
});

describe("hasActiveRun", () => {
  it("is false when the asset has no runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    expect(hasActiveRun(asset.id, db)).toBe(false);
  });

  it("is true while a run is in progress and false once it finishes", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun(asset.repoUrl!, "git", asset.id, db);
    expect(hasActiveRun(asset.id, db)).toBe(true);

    updateRunStage(run.id, "done", "succeeded", {}, db);
    expect(hasActiveRun(asset.id, db)).toBe(false);
  });

  // (#73) A cancelled run must not block a fresh scan — cancelling should
  // free the asset up for re-scanning immediately, same as succeeded/failed.
  it("is false once a running run has been cancelled", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun(asset.repoUrl!, "git", asset.id, db);
    expect(hasActiveRun(asset.id, db)).toBe(true);

    cancelRun(run.id, "취소", db);

    expect(hasActiveRun(asset.id, db)).toBe(false);
  });
});

describe("triggerRunForAsset", () => {
  it("creates a git run and marks it with the given trigger type for a repo asset", async () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const deps: TriggerDeps = {
      runPipeline: vi.fn().mockResolvedValue(undefined),
      runServerScanPipeline: vi.fn(),
    };

    const runId = await triggerRunForAsset(asset, "scheduled", deps, db);

    expect(deps.runPipeline).toHaveBeenCalledWith(
      runId,
      { type: "git", repoUrl: asset.repoUrl },
      undefined,
      db,
    );
    expect(deps.runServerScanPipeline).not.toHaveBeenCalled();
    const run = getRun(runId, db)!;
    expect(run.assetId).toBe(asset.id);
    expect(run.triggerType).toBe("scheduled");
  });

  // multi-image assets pin a specific Dockerfile; the scheduler must build the
  // same image as a manual scan (POST /api/runs), not silently auto-detect.
  it("passes the asset's dockerfilePath through to runPipeline for a repo asset", async () => {
    const asset = createRepoAsset(
      { displayName: "a", repoUrl: "https://github.com/x/a", dockerfilePath: "backend/Dockerfile" },
      db,
    );
    const deps: TriggerDeps = {
      runPipeline: vi.fn().mockResolvedValue(undefined),
      runServerScanPipeline: vi.fn(),
    };

    const runId = await triggerRunForAsset(asset, "scheduled", deps, db);

    expect(deps.runPipeline).toHaveBeenCalledWith(
      runId,
      { type: "git", repoUrl: asset.repoUrl, dockerfilePath: "backend/Dockerfile" },
      undefined,
      db,
    );
  });

  it("creates a server run immediately without waiting for the scan to finish", async () => {
    const asset = createServerAsset(
      { displayName: "srv", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "root", secret: "pw" },
      db,
    );
    let resolveScan: () => void;
    const scanPromise = new Promise<void>((resolve) => {
      resolveScan = resolve;
    });
    const deps: TriggerDeps = {
      runPipeline: vi.fn(),
      runServerScanPipeline: vi.fn().mockReturnValue(scanPromise),
    };

    const runId = await triggerRunForAsset(asset, "scheduled", deps, db);

    // triggerRunForAsset already resolved even though scanPromise has not —
    // proves the server path doesn't block on the scan.
    expect(deps.runServerScanPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ id: runId }),
      expect.objectContaining({ id: asset.id }),
      undefined,
      db,
    );
    expect(deps.runPipeline).not.toHaveBeenCalled();
    expect(getRun(runId, db)!.triggerType).toBe("scheduled");

    resolveScan!(); // cleanup: let the pending promise settle so it doesn't leak into other tests
    await scanPromise;
  });
});
