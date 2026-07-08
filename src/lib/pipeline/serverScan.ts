import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Asset } from "@/lib/assets/types";
import { getAsset, listAssets } from "@/lib/assets/store";
import { runAnsibleForServer } from "@/lib/checks/ansibleRunner";
import { retryOnConnectionFailure, AuthFailureError } from "@/lib/checks/retry";
import { evaluateAllChecks } from "@/lib/checks/ruleEvaluation";
import { saveCheckResults } from "@/lib/checks/store";
import type { CheckResult } from "@/lib/checks/types";
import { analyzeAndSaveChecks } from "@/lib/claude";
import { createRun, updateRunStage } from "@/lib/pipeline/runs";
import type { Run } from "@/lib/pipeline/types";
import { createScanBatch } from "./scanBatches";

const FLEET_SCAN_CONCURRENCY = 5;

export interface ServerScanDeps {
  runAnsibleForServer: typeof runAnsibleForServer;
  retryOnConnectionFailure: typeof retryOnConnectionFailure;
  evaluateAllChecks: typeof evaluateAllChecks;
  saveCheckResults: typeof saveCheckResults;
  analyzeAndSaveChecks: typeof analyzeAndSaveChecks;
}

const defaultDeps: ServerScanDeps = {
  runAnsibleForServer,
  retryOnConnectionFailure,
  evaluateAllChecks,
  saveCheckResults,
  analyzeAndSaveChecks,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Creates the run row (and, for a fleet scan, attaches it to the batch)
// synchronously, before any SSH/ansible work starts. Split out from
// scanServerAsset so callers that need to respond with a runId right away
// (e.g. the POST /api/runs route) can do so without waiting for the whole
// scan to finish — mirroring how the container path's route calls the
// synchronous createRun() and then fire-and-forgets runPipeline().
export function createServerRun(
  assetId: string,
  batchId: string | null = null,
  db: Database = getDb(),
): { run: Run; asset: Asset } {
  const asset = getAsset(assetId, db);
  if (!asset) {
    throw new Error(`자산을 찾을 수 없습니다: ${assetId}`);
  }

  const run = createRun(asset.hostIp ?? asset.hostname ?? asset.displayName, "server", asset.id, db);
  if (batchId) {
    db.prepare(`UPDATE runs SET batch_id = @batchId WHERE id = @id`).run({ batchId, id: run.id });
  }
  return { run, asset };
}

// Drives an already-created server run through connect -> ansible_scan ->
// rule_evaluation -> claude_analysis -> done, mirroring the container path's
// clone -> build -> sandbox -> ansible -> rule_eval -> claude -> done in
// orchestrator.ts. "connect" and "ansible_scan" both wrap the single
// runAnsibleForServer call (ansible-playbook establishes the SSH connection
// and runs the checks in one invocation — there's no separately observable
// "connected, now scanning" boundary) rather than two independently
// retryable steps.
export async function runServerScanPipeline(
  run: Run,
  asset: Asset,
  deps: ServerScanDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  updateRunStage(run.id, "connect", "running", {}, db);
  let tasks;
  try {
    tasks = await deps.retryOnConnectionFailure(() => deps.runAnsibleForServer(asset));
  } catch (err) {
    // Global constraint: never surface raw credentials/stderr for an auth
    // failure — only the fixed "인증 실패" message is recorded.
    const message = err instanceof AuthFailureError ? "인증 실패" : errorMessage(err);
    updateRunStage(run.id, "connect", "failed", { errorMessage: message }, db);
    return;
  }
  updateRunStage(run.id, "connect", "succeeded", {}, db);
  updateRunStage(run.id, "ansible_scan", "succeeded", {}, db);

  updateRunStage(run.id, "rule_evaluation", "running", {}, db);
  const results: CheckResult[] = deps.evaluateAllChecks(null, tasks);
  deps.saveCheckResults(run.id, results, db);
  updateRunStage(run.id, "rule_evaluation", "succeeded", {}, db);

  updateRunStage(run.id, "claude_analysis", "running", {}, db);
  try {
    await deps.analyzeAndSaveChecks(run.id, results, db);
  } catch (err) {
    // AI failure is independent of check failure: check_results committed
    // above stay queryable even if analysis fails here (same guarantee as
    // the container pipeline's claude stage).
    updateRunStage(run.id, "claude_analysis", "failed", { errorMessage: errorMessage(err) }, db);
    return;
  }
  updateRunStage(run.id, "claude_analysis", "succeeded", {}, db);
  updateRunStage(run.id, "done", "succeeded", {}, db);
}

// Single-server convenience wrapper: create the run, run it to completion,
// and return its id. Used by scanProjectFleet (which awaits every server in
// the fleet as part of building its response) and by anything else that
// wants a plain "scan this one server and tell me the run id" call. Callers
// that need to respond before the scan finishes (the single-run API route)
// use createServerRun + runServerScanPipeline directly instead.
export async function scanServerAsset(
  assetId: string,
  batchId: string | null = null,
  deps: ServerScanDeps = defaultDeps,
  db: Database = getDb(),
): Promise<string> {
  const { run, asset } = createServerRun(assetId, batchId, db);
  await runServerScanPipeline(run, asset, deps, db);
  return run.id;
}

// Runs `tasks` with at most `limit` in flight at once. A failing task is
// caught and dropped rather than rejecting the whole batch, since a fleet
// scan must not let one unreachable server abort the rest.
export async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        await tasks[index]();
      } catch {
        // Individual failures are already recorded on their own run (via
        // scanServerAsset's updateRunStage calls) — isolate them here so the
        // rest of the fleet keeps scanning.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

// Scans every server asset in a project under one shared batch id, at most
// FLEET_SCAN_CONCURRENCY at a time.
export async function scanProjectFleet(
  projectId: string,
  deps: ServerScanDeps = defaultDeps,
  db: Database = getDb(),
): Promise<{ batchId: string; runIds: string[] }> {
  const batch = createScanBatch(projectId, db);
  const servers = listAssets({ projectId, type: "server" }, db);
  const runIds: string[] = [];
  const tasks = servers.map((asset) => async () => {
    const runId = await scanServerAsset(asset.id, batch.id, deps, db);
    runIds.push(runId);
  });
  await runWithConcurrency(tasks, FLEET_SCAN_CONCURRENCY);
  return { batchId: batch.id, runIds };
}
