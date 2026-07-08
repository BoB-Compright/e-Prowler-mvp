import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset, createServerAsset } from "@/lib/assets/store";
import { createRun, getRun, updateRunStage } from "@/lib/pipeline/runs";
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
});

describe("triggerRunForAsset", () => {
  it("creates a git run and marks it with the given trigger type for a repo asset", async () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const deps: TriggerDeps = {
      runPipeline: vi.fn().mockResolvedValue(undefined),
      scanServerAsset: vi.fn(),
    };

    const runId = await triggerRunForAsset(asset, "scheduled", deps, db);

    expect(deps.runPipeline).toHaveBeenCalledWith(
      runId,
      { type: "git", repoUrl: asset.repoUrl },
      undefined,
      db,
    );
    expect(deps.scanServerAsset).not.toHaveBeenCalled();
    const run = getRun(runId, db)!;
    expect(run.assetId).toBe(asset.id);
    expect(run.triggerType).toBe("scheduled");
  });

  it("delegates to scanServerAsset for a server asset and marks the resulting run", async () => {
    const asset = createServerAsset(
      { displayName: "srv", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "root", secret: "pw" },
      db,
    );
    const preCreatedRun = createRun(asset.hostIp!, "server", asset.id, db);
    const deps: TriggerDeps = {
      runPipeline: vi.fn(),
      scanServerAsset: vi.fn().mockResolvedValue(preCreatedRun.id),
    };

    const runId = await triggerRunForAsset(asset, "scheduled", deps, db);

    expect(deps.scanServerAsset).toHaveBeenCalledWith(asset.id, null);
    expect(deps.runPipeline).not.toHaveBeenCalled();
    expect(runId).toBe(preCreatedRun.id);
    expect(getRun(runId, db)!.triggerType).toBe("scheduled");
  });
});
