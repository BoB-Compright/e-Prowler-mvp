import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createProject } from "@/lib/projects/store";
import { createServerAsset, createRepoAsset } from "@/lib/assets/store";
import { cancelRun, getRun } from "@/lib/pipeline/runs";
import { createScanBatch } from "./scanBatches";
import { listCheckResults } from "@/lib/checks/store";
import { saveCheckResults } from "@/lib/checks/store";
import type { CheckResult } from "@/lib/checks/types";
import { osUnixPack } from "@/lib/packs/osUnix";
import type { CheckPlan, EvalContext } from "@/lib/packs/types";
import type { Asset } from "@/lib/assets/types";
import { analyzeAndSaveChecks } from "@/lib/claude";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { retryOnConnectionFailure, AuthFailureError, ConnectionFailureError } from "@/lib/checks/retry";
import {
  createServerRun,
  repoScanConcurrency,
  runServerScanPipeline,
  runWithConcurrency,
  scanProjectFleet,
  scanServerAsset,
  startProjectFleetScan,
  type ServerScanDeps,
} from "./serverScan";

let db: Database;

// resolveCheckPlan/evaluatePlan are stubbed (not the real vendor-pack
// implementation) — the real osUnixPack only covers U-* items, so it can't
// produce a "C-01" result for the fixture task below. The stub instead maps
// each ansible task straight to a "pass" CheckResult keyed by its catalog id
// prefix, which is enough to exercise the pipeline wiring (resolve -> run
// ansible with plan.evidenceTasks -> evaluate -> save) without duplicating
// resolve.ts/osUnix.ts's own (separately tested) logic here.
function fakeResolveCheckPlan(_asset: Asset): CheckPlan {
  return { packs: [osUnixPack], evidenceTasks: [] };
}

function fakeEvaluatePlan(_plan: CheckPlan, ctx: EvalContext, _asset: Asset): CheckResult[] {
  return ctx.tasks.map((t) => ({
    id: t.taskName.split(":")[0].trim(),
    status: "pass",
    evidence: t.stdout,
  }));
}

// Only the actual SSH/ansible-playbook boundary (runAnsibleForServer) is
// mocked here — check persistence and Claude analysis reuse the real
// (already independently tested) implementations, same as the container
// orchestrator's tests mock only clone/build/sandbox/runChecks.
// resolveCheckPlan/evaluatePlan are stubbed (see fakeResolveCheckPlan above).
function baseDeps(overrides: Partial<ServerScanDeps> = {}): ServerScanDeps {
  return {
    runAnsibleForServer: vi.fn().mockResolvedValue([{ taskName: "C-01: runtime uid", stdout: "1000\n" }]),
    retryOnConnectionFailure,
    resolveCheckPlan: fakeResolveCheckPlan,
    evaluatePlan: fakeEvaluatePlan,
    saveCheckResults,
    analyzeAndSaveChecks,
    runPipeline,
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

describe("createServerRun", () => {
  // The single-run API route needs a runId to respond with before the scan
  // finishes, so run creation must be synchronous and separable from the
  // async pipeline in runServerScanPipeline — this is what makes a
  // fire-and-forget POST /api/runs possible for server assets.
  it("creates the run synchronously without running the pipeline", () => {
    const asset = createServerAsset(serverAssetInput(), db);

    const { run, asset: returnedAsset } = createServerRun(asset.id, null, db);

    expect(run.sourceType).toBe("server");
    expect(run.stage).toBe("clone"); // pipeline hasn't started yet
    expect(run.assetId).toBe(asset.id);
    expect(returnedAsset.id).toBe(asset.id);
    // No connect/ansible events yet since runServerScanPipeline hasn't run.
    expect(getRun(run.id, db)!.status).toBe("running");
  });

  it("attaches the run to the given batch id", () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const asset = createServerAsset(serverAssetInput(), db);
    const batch = createScanBatch(project.id, db);

    const { run } = createServerRun(asset.id, batch.id, db);

    expect(getRun(run.id, db)!.batchId).toBe(batch.id);
  });

  it("throws when the asset does not exist", () => {
    expect(() => createServerRun("missing-id", null, db)).toThrow("자산을 찾을 수 없습니다");
  });
});

describe("runServerScanPipeline", () => {
  it("drives an already-created run to done, given the same createServerRun + runServerScanPipeline split the API route uses", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const { run } = createServerRun(asset.id, null, db);
    const deps = baseDeps();

    await runServerScanPipeline(run, asset, deps, db);

    const finished = getRun(run.id, db)!;
    expect(finished.stage).toBe("done");
    expect(finished.status).toBe("succeeded");
  });
});

// (#73) Same cooperative cancellation model as the container orchestrator:
// no PID/handle is kept for the ansible-playbook SSH subprocess here, so a
// cancel request can only flip run.status out-of-band and wait for
// runServerScanPipeline to notice at its next await boundary — an in-flight
// ansible-playbook invocation (up to SERVER_TIMEOUT_MS / retries) is *not*
// force-killed for a server asset, unlike the container path where the
// sandbox itself can be torn down. This is the documented limitation.
describe("runServerScanPipeline cancellation (#73)", () => {
  it("stops after the SSH/ansible step resolves once cancelled mid-scan, without saving results or advancing to rule_evaluation", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const { run } = createServerRun(asset.id, null, db);
    const deps = baseDeps({
      runAnsibleForServer: vi.fn().mockImplementation(async () => {
        cancelRun(run.id, "사용자가 취소", db);
        return [{ taskName: "C-01: runtime uid", stdout: "1000\n" }];
      }),
    });

    await runServerScanPipeline(run, asset, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");
    expect(updated.stage).toBe("connect");
    expect(listCheckResults(run.id, db)).toEqual([]);
  });

  it("does not overwrite a cancelled run with 'failed' when the in-flight SSH/ansible step errors after cancellation", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const { run } = createServerRun(asset.id, null, db);
    const deps = baseDeps({
      runAnsibleForServer: vi.fn().mockImplementation(async () => {
        cancelRun(run.id, "사용자가 취소", db);
        throw new Error("connection reset");
      }),
    });

    await runServerScanPipeline(run, asset, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled"); // not "failed"
  });

  it("stops after claude analysis resolves once cancelled mid-analysis, without marking the run done", async () => {
    const asset = createServerAsset(serverAssetInput(), db);
    const { run } = createServerRun(asset.id, null, db);
    const deps = baseDeps({
      analyzeAndSaveChecks: vi.fn().mockImplementation(async () => {
        cancelRun(run.id, "사용자가 취소", db);
        return undefined;
      }),
    });

    await runServerScanPipeline(run, asset, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");
    expect(updated.stage).toBe("claude_analysis");
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

describe("repoScanConcurrency", () => {
  it("REPO_SCAN_CONCURRENCY 파싱: 유효/무효/미설정", () => {
    expect(repoScanConcurrency({})).toBe(2);
    expect(repoScanConcurrency({ REPO_SCAN_CONCURRENCY: "3" })).toBe(3);
    expect(repoScanConcurrency({ REPO_SCAN_CONCURRENCY: "abc" })).toBe(2);
    expect(repoScanConcurrency({ REPO_SCAN_CONCURRENCY: "0" })).toBe(2);
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

describe("startProjectFleetScan", () => {
  // The fleet-scan API route needs a batchId/runIds to respond with right
  // away so the client can navigate to the batch page — awaiting the whole
  // fleet (as scanProjectFleet does) would hold that HTTP request open for
  // the entire batch, which can take many minutes.
  it("returns batch/run ids synchronously, before any run has finished", async () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const assets = Array.from({ length: 2 }, (_, i) =>
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

    const result = startProjectFleetScan(project.id, deps, db);

    expect(result.runIds).toHaveLength(assets.length);
    for (const runId of result.runIds) {
      const run = getRun(runId, db)!;
      expect(run.batchId).toBe(result.batchId);
      expect(run.stage).not.toBe("done");
    }

    await vi.waitFor(() => {
      for (const runId of result.runIds) {
        expect(getRun(runId, db)!.stage).toBe("done");
      }
    });
  });

  it("does not scan assets from other projects", () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const otherProject = createProject({ name: "Q", pmName: "이", pmEmail: "b@nh.com", sharePassword: "pw" }, db);
    createServerAsset(serverAssetInput({ projectId: otherProject.id }), db);
    const deps = baseDeps();

    const result = startProjectFleetScan(project.id, deps, db);

    expect(result.runIds).toHaveLength(0);
  });

  it("프로젝트의 repo 자산에 대해 dockerfilePath를 실은 git run을 만든다", async () => {
    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    createRepoAsset(
      { displayName: "backend", repoUrl: "https://github.com/o/r", projectId: project.id, dockerfilePath: "backend/Dockerfile" },
      db,
    );
    const runPipelineSpy = vi.fn().mockResolvedValue(undefined);
    const deps = { ...baseDeps(), runPipeline: runPipelineSpy };

    const { runIds } = startProjectFleetScan(project.id, deps, db);

    await vi.waitFor(() => {
      expect(runPipelineSpy).toHaveBeenCalled();
    });
    expect(runIds).toHaveLength(1);
    expect(runPipelineSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: "git", repoUrl: expect.stringContaining("github.com/o/r"), dockerfilePath: "backend/Dockerfile" }),
      undefined, // orchestrator의 기본 PipelineDeps를 쓰도록 명시적으로 undefined를 넘김
      db,
    );
  });
});
