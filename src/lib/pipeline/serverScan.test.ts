import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createProject } from "@/lib/projects/store";
import { createServerAsset } from "@/lib/assets/store";
import { getRun } from "@/lib/pipeline/runs";
import { createScanBatch } from "./scanBatches";
import { listCheckResults } from "@/lib/checks/store";
import { evaluateAllChecks } from "@/lib/checks/ruleEvaluation";
import { saveCheckResults } from "@/lib/checks/store";
import { analyzeAndSaveChecks } from "@/lib/claude";
import { retryOnConnectionFailure, AuthFailureError, ConnectionFailureError } from "@/lib/checks/retry";
import {
  runWithConcurrency,
  scanProjectFleet,
  scanServerAsset,
  type ServerScanDeps,
} from "./serverScan";

let db: Database;

// Only the actual SSH/ansible-playbook boundary (runAnsibleForServer) is
// mocked here — rule evaluation, check persistence and Claude analysis reuse
// the real (already independently tested) implementations, same as the
// container orchestrator's tests mock only clone/build/sandbox/runChecks.
function baseDeps(overrides: Partial<ServerScanDeps> = {}): ServerScanDeps {
  return {
    runAnsibleForServer: vi.fn().mockResolvedValue([{ taskName: "C-01: runtime uid", stdout: "1000\n" }]),
    retryOnConnectionFailure,
    evaluateAllChecks,
    saveCheckResults,
    analyzeAndSaveChecks,
    ...overrides,
  };
}

function serverAssetInput(overrides: Partial<Parameters<typeof createServerAsset>[0]> = {}) {
  return {
    displayName: "web-01",
    hostIp: "10.0.0.5",
    hostname: "web-01",
    sshPort: 22,
    authType: "password" as const,
    username: "admin",
    secret: "pw",
    ...overrides,
  };
}

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("scanServerAsset", () => {
  it("runs connect -> ansible_scan -> rule_evaluation -> claude_analysis -> done for a healthy server", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const deps = baseDeps();

    const runId = await scanServerAsset(asset.id, null, deps, db);

    const run = getRun(runId, db)!;
    expect(run.stage).toBe("done");
    expect(run.status).toBe("succeeded");
    expect(run.assetId).toBe(asset.id);
    expect(run.sourceType).toBe("server");
    expect(listCheckResults(runId, db).find((r) => r.id === "C-01")?.status).toBe("pass");
  });

  it("marks connect failed with a fixed Korean message on auth failure, without retrying", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const runAnsibleForServer = vi.fn().mockRejectedValue(new AuthFailureError("bad password"));
    const deps = baseDeps({ runAnsibleForServer });

    const runId = await scanServerAsset(asset.id, null, deps, db);

    const run = getRun(runId, db)!;
    expect(run.stage).toBe("connect");
    expect(run.status).toBe("failed");
    expect(run.errorMessage).toBe("인증 실패");
    expect(runAnsibleForServer).toHaveBeenCalledTimes(1);
    // No check results should be saved once connect fails.
    expect(listCheckResults(runId, db)).toEqual([]);
  });

  it("marks connect failed with the underlying message once connection retries are exhausted", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const deps = baseDeps({
      retryOnConnectionFailure: vi.fn().mockRejectedValue(new ConnectionFailureError("연결 실패")),
    });

    const runId = await scanServerAsset(asset.id, null, deps, db);

    const run = getRun(runId, db)!;
    expect(run.stage).toBe("connect");
    expect(run.status).toBe("failed");
    expect(run.errorMessage).toBe("연결 실패");
  });

  it("associates the run with the given batch id", async () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const asset = createServerAsset(serverAssetInput(), db);
    const batch = createScanBatch(project.id, db);
    const deps = baseDeps();

    const runId = await scanServerAsset(asset.id, batch.id, deps, db);

    expect(getRun(runId, db)!.batchId).toBe(batch.id);
  });

  it("throws when the asset does not exist", async () => {
    const deps = baseDeps();
    await expect(scanServerAsset("missing-id", null, deps, db)).rejects.toThrow("자산을 찾을 수 없습니다");
  });

  it("fails at claude_analysis without losing already-saved check results", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const deps = baseDeps({
      analyzeAndSaveChecks: vi.fn().mockRejectedValue(new Error("ANTHROPIC_API_KEY missing")),
    });

    const runId = await scanServerAsset(asset.id, null, deps, db);

    const run = getRun(runId, db)!;
    expect(run.stage).toBe("claude_analysis");
    expect(run.status).toBe("failed");
    expect(run.errorMessage).toBe("ANTHROPIC_API_KEY missing");
    expect(listCheckResults(runId, db).length).toBeGreaterThan(0);
  });
});

describe("runWithConcurrency", () => {
  it("never runs more than the limit at once", async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 12 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    await runWithConcurrency(tasks, 5);
    expect(maxActive).toBeLessThanOrEqual(5);
  });

  it("runs all tasks", async () => {
    const done: number[] = [];
    const tasks = Array.from({ length: 7 }, (_, i) => async () => {
      done.push(i);
    });
    await runWithConcurrency(tasks, 5);
    expect(done.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("isolates a failing task without aborting the rest", async () => {
    const done: number[] = [];
    const tasks = [
      async () => {
        done.push(0);
      },
      async () => {
        throw new Error("boom");
      },
      async () => {
        done.push(2);
      },
    ];
    await runWithConcurrency(tasks, 2);
    expect(done.sort()).toEqual([0, 2]);
  });
});

describe("scanProjectFleet", () => {
  it("scans every server asset in the project under one batch id", async () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const assets = Array.from({ length: 3 }, (_, i) =>
      createServerAsset(
        serverAssetInput({
          displayName: `web-${i}`,
          hostIp: `10.0.0.${i}`,
          hostname: `web-${i}`,
          projectId: project.id,
        }),
        db,
      ),
    );
    const deps = baseDeps();

    const result = await scanProjectFleet(project.id, deps, db);

    expect(result.runIds).toHaveLength(assets.length);
    for (const runId of result.runIds) {
      const run = getRun(runId, db)!;
      expect(run.batchId).toBe(result.batchId);
      expect(run.stage).toBe("done");
    }
  });

  it("does not scan repo assets or assets from other projects", async () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const otherProject = createProject({ name: "Q", pmName: "이", pmEmail: "b@nh.com", sharePassword: "pw" }, db);
    createServerAsset(serverAssetInput({ projectId: otherProject.id }), db);
    const deps = baseDeps();

    const result = await scanProjectFleet(project.id, deps, db);

    expect(result.runIds).toHaveLength(0);
  });
});
