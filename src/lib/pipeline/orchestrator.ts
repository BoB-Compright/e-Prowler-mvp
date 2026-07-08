import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { cloneRepo } from "./clone";
import { detectDockerfile } from "./dockerfile";
import { buildImage } from "./build";
import { startSandbox, stopSandbox } from "./sandbox";
import { scheduleSandboxTimeout } from "./sandboxTimeout";
import { updateRunStage } from "./runs";
import { runAllChecks } from "@/lib/checks";
import { saveCheckResults } from "@/lib/checks/store";
import { analyzeAndSaveChecks } from "@/lib/claude";

export interface PipelineDeps {
  clone: typeof cloneRepo;
  detectDockerfile: typeof detectDockerfile;
  build: typeof buildImage;
  startSandbox: typeof startSandbox;
  stopSandbox: typeof stopSandbox;
  scheduleSandboxTimeout: typeof scheduleSandboxTimeout;
  runChecks: typeof runAllChecks;
  analyzeChecks: typeof analyzeAndSaveChecks;
}

const defaultDeps: PipelineDeps = {
  clone: cloneRepo,
  detectDockerfile,
  build: buildImage,
  startSandbox,
  stopSandbox,
  scheduleSandboxTimeout,
  runChecks: runAllChecks,
  analyzeChecks: analyzeAndSaveChecks,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Drives a run through clone -> build -> sandbox -> ansible -> rule_eval -> claude -> done.
export async function runPipeline(
  runId: string,
  repoUrl: string,
  deps: PipelineDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  let repoDir: string;
  try {
    const result = await deps.clone(repoUrl, runId);
    repoDir = result.dir;
  } catch (err) {
    updateRunStage(runId, "clone", "failed", { errorMessage: errorMessage(err) }, db);
    return;
  }
  updateRunStage(runId, "clone", "succeeded", {}, db);

  const dockerfilePath = deps.detectDockerfile(repoDir);
  if (!dockerfilePath) {
    updateRunStage(
      runId,
      "build",
      "failed",
      { errorMessage: "Dockerfile을 찾을 수 없습니다 (레포 루트 기준)" },
      db,
    );
    return;
  }

  updateRunStage(runId, "build", "running", {}, db);
  const imageTag = `scan-${runId}`;
  try {
    await deps.build(repoDir, imageTag);
  } catch (err) {
    updateRunStage(runId, "build", "failed", { errorMessage: errorMessage(err) }, db);
    return;
  }
  updateRunStage(runId, "build", "succeeded", { imageTag }, db);

  updateRunStage(runId, "sandbox", "running", {}, db);
  const containerName = `scan-${runId}`;
  try {
    await deps.startSandbox(imageTag, containerName);
  } catch (err) {
    updateRunStage(runId, "sandbox", "failed", { errorMessage: errorMessage(err) }, db);
    return;
  }
  updateRunStage(runId, "sandbox", "succeeded", { containerName }, db);
  // Safety net in case the ansible step below hangs or this process is
  // killed before it finishes; cancelled once we're done with the container.
  const sandboxTimeout = deps.scheduleSandboxTimeout(runId, containerName, undefined, undefined, db);

  updateRunStage(runId, "ansible", "running", {}, db);
  let results;
  try {
    results = await deps.runChecks(dockerfilePath, containerName);
  } catch (err) {
    clearTimeout(sandboxTimeout);
    await deps.stopSandbox(containerName);
    updateRunStage(runId, "ansible", "failed", { errorMessage: errorMessage(err) }, db);
    return;
  }
  clearTimeout(sandboxTimeout);
  await deps.stopSandbox(containerName);
  updateRunStage(runId, "ansible", "succeeded", {}, db);

  updateRunStage(runId, "rule_eval", "running", {}, db);
  saveCheckResults(runId, results, db);
  updateRunStage(runId, "rule_eval", "succeeded", {}, db);

  updateRunStage(runId, "claude", "running", {}, db);
  try {
    await deps.analyzeChecks(runId, results, db);
  } catch (err) {
    // AI failure is independent of check failure: check_results above are
    // already committed and stay queryable even if analysis fails here.
    updateRunStage(runId, "claude", "failed", { errorMessage: errorMessage(err) }, db);
    return;
  }
  updateRunStage(runId, "claude", "succeeded", {}, db);
  updateRunStage(runId, "done", "succeeded", {}, db);
}
