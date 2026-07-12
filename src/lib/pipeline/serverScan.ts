import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Asset } from "@/lib/assets/types";
import { getAsset, listAssets } from "@/lib/assets/store";
import { runAnsibleForServer, type AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import { retryOnConnectionFailure, AuthFailureError } from "@/lib/checks/retry";
import { saveCheckResults } from "@/lib/checks/store";
import type { CheckResult } from "@/lib/checks/types";
import { resolveCheckPlan, evaluatePlan } from "@/lib/packs/resolve";
import { analyzeAndSaveChecks } from "@/lib/claude";
import { createRun, isCancelled, updateRunStage } from "@/lib/pipeline/runs";
import type { Run } from "@/lib/pipeline/types";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { createScanBatch } from "./scanBatches";

const FLEET_SCAN_CONCURRENCY = 5;

// Repo assets do a local `docker build` (heavy: CPU/memory/disk), unlike
// server assets which just hold open an SSH connection — so repo tasks get
// their own, lower concurrency limit instead of sharing FLEET_SCAN_CONCURRENCY
// with server tasks (5 concurrent docker builds was exhausting memory).
// Configurable via REPO_SCAN_CONCURRENCY for environments with more/less
// headroom; defaults to 2 when unset or not a valid positive integer.
export function repoScanConcurrency(env: Record<string, string | undefined> = process.env): number {
  const raw = env.REPO_SCAN_CONCURRENCY;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 2;
}

export interface ServerScanDeps {
  runAnsibleForServer: typeof runAnsibleForServer;
  retryOnConnectionFailure: typeof retryOnConnectionFailure;
  resolveCheckPlan: typeof resolveCheckPlan;
  evaluatePlan: typeof evaluatePlan;
  saveCheckResults: typeof saveCheckResults;
  analyzeAndSaveChecks: typeof analyzeAndSaveChecks;
  runPipeline: typeof runPipeline;
}

const defaultDeps: ServerScanDeps = {
  runAnsibleForServer,
  retryOnConnectionFailure,
  resolveCheckPlan,
  evaluatePlan,
  saveCheckResults,
  analyzeAndSaveChecks,
  runPipeline,
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
//
// Cancellation (#73): unlike the container path, there is no container to
// force-stop here — the SSH connection is a plain ansible-playbook child
// process (via execFile) that this module never keeps a handle to, so it
// cannot be killed on demand. Cancellation is purely cooperative: the cancel
// API flips run.status to "cancelled" out-of-band, and this function checks
// isCancelled() right after each await (retryOnConnectionFailure's wrapped
// call, and analyzeAndSaveChecks) before writing its own status. In
// practice this means an in-flight SSH connect/ansible-playbook run (which
// can itself retry for minutes) keeps running to its natural completion
// after cancel is requested — only once it settles does the pipeline stop
// advancing; the run row itself is already "cancelled" immediately from the
// user's perspective (the UI stops polling right away).
export async function runServerScanPipeline(
  run: Run,
  asset: Asset,
  deps: ServerScanDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  updateRunStage(run.id, "connect", "running", {}, db);
  const plan = deps.resolveCheckPlan(asset);
  // A fully-windows plan (every selected pack has executionPath "windows",
  // e.g. os-windows + web-iis) has no real SSH/ansible target to reach yet —
  // there's no sshd on a Windows host, and evaluatePack already ignores
  // `tasks` for windows packs, unconditionally returning "Windows 호스트
  // 연결 대기" review results. Running runAnsibleForServer here would only
  // dial a connection that can never succeed and would prevent those review
  // results from ever being recorded, so skip straight to evaluation.
  const windowsOnly = plan.packs.length > 0 && plan.packs.every((p) => p.executionPath === "windows");
  let tasks: AnsibleTaskOutput[];
  if (windowsOnly) {
    tasks = [];
    if (isCancelled(run.id, db)) return;
    // Use `message` (event log only), not `errorMessage` (persisted on the run
    // row and rendered in a red "fail" box by RunStatus) — this is informational,
    // not a failure.
    updateRunStage(run.id, "connect", "succeeded", { message: "Windows 호스트 점검은 WinRM 연결 대기 — SSH/Ansible 단계 생략" }, db);
    updateRunStage(run.id, "ansible_scan", "succeeded", { message: "Windows 호스트 점검은 WinRM 연결 대기 — SSH/Ansible 단계 생략" }, db);
  } else {
    try {
      tasks = await deps.retryOnConnectionFailure(() => deps.runAnsibleForServer(asset, plan.evidenceTasks));
    } catch (err) {
      // Global constraint: never surface raw credentials/stderr for an auth
      // failure — only the fixed "인증 실패" message is recorded.
      const message = err instanceof AuthFailureError ? "인증 실패" : errorMessage(err);
      if (isCancelled(run.id, db)) return;
      updateRunStage(run.id, "connect", "failed", { errorMessage: message }, db);
      return;
    }
    if (isCancelled(run.id, db)) return;
    updateRunStage(run.id, "connect", "succeeded", {}, db);
    updateRunStage(run.id, "ansible_scan", "succeeded", {}, db);
  }

  updateRunStage(run.id, "rule_evaluation", "running", {}, db);
  const results: CheckResult[] = deps.evaluatePlan(plan, { findings: null, tasks }, asset);
  deps.saveCheckResults(run.id, results, db);
  updateRunStage(run.id, "rule_evaluation", "succeeded", {}, db);

  updateRunStage(run.id, "claude_analysis", "running", {}, db);
  try {
    await deps.analyzeAndSaveChecks(run.id, results, db);
  } catch (err) {
    if (isCancelled(run.id, db)) return;
    // AI failure is independent of check failure: check_results committed
    // above stay queryable even if analysis fails here (same guarantee as
    // the container pipeline's claude stage).
    updateRunStage(run.id, "claude_analysis", "failed", { errorMessage: errorMessage(err) }, db);
    return;
  }
  if (isCancelled(run.id, db)) return;
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

// Creates the run row for a repo asset (one per Dockerfile) and, for a fleet
// scan, attaches it to the batch — mirroring createServerRun's synchronous
// row-creation split, so the run shows up in the batch view right away even
// before deps.runPipeline (the container orchestrator) starts working on it.
export function createRepoRun(asset: Asset, batchId: string | null, db: Database): Run {
  const run = createRun(asset.repoUrl!, "git", asset.id, db);
  if (batchId) {
    db.prepare(`UPDATE runs SET batch_id = @batchId WHERE id = @id`).run({ batchId, id: run.id });
  }
  return run;
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
// FLEET_SCAN_CONCURRENCY at a time. Awaits the whole fleet before resolving —
// used by tests and any caller that wants the finished batch, not by the API
// route (see startProjectFleetScan for that).
export async function scanProjectFleet(
  projectId: string,
  deps: ServerScanDeps = defaultDeps,
  db: Database = getDb(),
): Promise<{ batchId: string; runIds: string[] }> {
  const batch = createScanBatch(projectId, db);
  const servers = listAssets({ projectId, type: "server" }, db);
  const repos = listAssets({ projectId, type: "repo" }, db);
  const runIds: string[] = [];
  const serverTasks = servers.map((asset) => async () => {
    const runId = await scanServerAsset(asset.id, batch.id, deps, db);
    runIds.push(runId);
  });
  const repoTasks = repos.map((asset) => async () => {
    const run = createRepoRun(asset, batch.id, db);
    runIds.push(run.id);
    await deps.runPipeline(
      run.id,
      {
        type: "git",
        repoUrl: asset.repoUrl!,
        ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
      },
      undefined, // orchestrator의 기본 PipelineDeps 사용
      db,
    );
  });
  await Promise.all([
    runWithConcurrency(serverTasks, FLEET_SCAN_CONCURRENCY),
    runWithConcurrency(repoTasks, repoScanConcurrency()),
  ]);
  return { batchId: batch.id, runIds };
}

// Fire-and-forget counterpart to scanProjectFleet: creates the batch and every
// run row synchronously (so the caller gets a real batchId/runIds right away),
// then drives the fleet through runServerScanPipeline in the background without
// blocking the caller. This is what the fleet-scan API route uses — awaiting
// scanProjectFleet there would hold the HTTP request open for the whole batch
// (potentially many minutes across FLEET_SCAN_CONCURRENCY-sized waves), leaving
// the client stuck before it could even navigate to the batch page.
export function startProjectFleetScan(
  projectId: string,
  deps: ServerScanDeps = defaultDeps,
  db: Database = getDb(),
): { batchId: string; runIds: string[] } {
  const batch = createScanBatch(projectId, db);
  const servers = listAssets({ projectId, type: "server" }, db);
  const created = servers.map((asset) => createServerRun(asset.id, batch.id, db));

  const repos = listAssets({ projectId, type: "repo" }, db);
  const repoCreated = repos.map((asset) => ({ run: createRepoRun(asset, batch.id, db), asset }));

  const serverTasks = created.map(({ run, asset }) => async () => {
    await runServerScanPipeline(run, asset, deps, db);
  });
  const repoTasks = repoCreated.map(({ run, asset }) => async () => {
    await deps.runPipeline(
      run.id,
      {
        type: "git",
        repoUrl: asset.repoUrl!,
        ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
      },
      undefined, // orchestrator의 기본 PipelineDeps 사용
      db,
    );
  });
  void Promise.all([
    runWithConcurrency(serverTasks, FLEET_SCAN_CONCURRENCY),
    runWithConcurrency(repoTasks, repoScanConcurrency()),
  ]);

  return {
    batchId: batch.id,
    runIds: [...created.map(({ run }) => run.id), ...repoCreated.map(({ run }) => run.id)],
  };
}
