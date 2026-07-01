import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { cloneRepo } from "./clone";
import { detectDockerfile } from "./dockerfile";
import { buildImage } from "./build";
import { startSandbox } from "./sandbox";
import { scheduleSandboxTimeout } from "./sandboxTimeout";
import { updateRunStage } from "./runs";

export interface PipelineDeps {
  clone: typeof cloneRepo;
  detectDockerfile: typeof detectDockerfile;
  build: typeof buildImage;
  startSandbox: typeof startSandbox;
  scheduleSandboxTimeout: typeof scheduleSandboxTimeout;
}

const defaultDeps: PipelineDeps = {
  clone: cloneRepo,
  detectDockerfile,
  build: buildImage,
  startSandbox,
  scheduleSandboxTimeout,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Drives a run through clone -> build -> sandbox. Later issues (#39-#40) will
// extend this with ansible/rule_eval/claude stages, reusing updateRunStage.
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
  deps.scheduleSandboxTimeout(runId, containerName, undefined, undefined, db);
}
