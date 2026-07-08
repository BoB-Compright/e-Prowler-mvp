import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { cloneRepo } from "./clone";
import { detectDockerfile } from "./dockerfile";
import { buildImage, removeImage } from "./build";
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
  removeImage: typeof removeImage;
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
  removeImage,
  startSandbox,
  stopSandbox,
  scheduleSandboxTimeout,
  runChecks: runAllChecks,
  analyzeChecks: analyzeAndSaveChecks,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// "git" clones and builds the repo as usual. "local_image" is the fallback
// path (#41): clone/build is skipped entirely and an already-built local
// image is scanned directly, so a demo can continue when GitHub or the
// Docker build is unavailable.
export type RunSource =
  | { type: "git"; repoUrl: string }
  | { type: "local_image"; imageTag: string };

// Drives a run through clone -> build -> sandbox -> ansible -> rule_eval -> claude -> done.
// For a local_image source, clone/build are marked succeeded immediately
// (nothing to do) and the pipeline starts at sandbox with the chosen image.
export async function runPipeline(
  runId: string,
  source: RunSource,
  deps: PipelineDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  let imageTag: string;
  let dockerfilePath: string | undefined;

  if (source.type === "local_image") {
    imageTag = source.imageTag;
    updateRunStage(runId, "clone", "succeeded", { message: "로컬 이미지 재점검: clone 단계 건너뜀" }, db);
    updateRunStage(
      runId,
      "build",
      "succeeded",
      { imageTag, message: "로컬 이미지 재점검: build 단계 건너뜀" },
      db,
    );
  } else {
    let repoDir: string;
    try {
      const result = await deps.clone(source.repoUrl, runId);
      repoDir = result.dir;
    } catch (err) {
      updateRunStage(runId, "clone", "failed", { errorMessage: errorMessage(err) }, db);
      return;
    }
    updateRunStage(runId, "clone", "succeeded", {}, db);

    dockerfilePath = deps.detectDockerfile(repoDir);
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
    imageTag = `scan-${runId}`;
    try {
      await deps.build(repoDir, imageTag);
    } catch (err) {
      updateRunStage(runId, "build", "failed", { errorMessage: errorMessage(err) }, db);
      return;
    }
    updateRunStage(runId, "build", "succeeded", { imageTag }, db);
  }

  // A git-sourced run builds a one-off `scan-<runId>` image that's never
  // reused by anything else; a local_image-sourced run reuses an image the
  // user owns and must never delete. Wrapping the rest of the pipeline in
  // try/finally means the git-built image gets cleaned up on every exit
  // path below (sandbox failure, ansible failure, or full success) without
  // repeating the cleanup call at each return.
  try {
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
  } finally {
    if (source.type === "git") {
      await deps.removeImage(imageTag);
    }
  }
}
