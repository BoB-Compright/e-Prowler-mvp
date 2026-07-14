import type { Database } from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { getAsset, updateAssetCategory } from "@/lib/assets/store";
import { detectKindFromResults } from "@/lib/assets/kind";
import { cloneRepo } from "./clone";
import { detectDockerfile } from "./dockerfile";
import { buildImage, removeImage } from "./build";
import { startSandbox, stopSandbox } from "./sandbox";
import { scheduleSandboxTimeout } from "./sandboxTimeout";
import { getRun, isCancelled, markRunStarted, updateRunStage } from "./runs";
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
  | { type: "git"; repoUrl: string; dockerfilePath?: string }
  | { type: "local_image"; imageTag: string };

// Drives a run through clone -> build -> sandbox -> ansible -> rule_eval -> claude -> done.
// For a local_image source, clone/build are marked succeeded immediately
// (nothing to do) and the pipeline starts at sandbox with the chosen image.
//
// Cancellation (#73): this pipeline is a plain fire-and-forget async
// function on the same Node process as the server (see POST /api/runs) —
// there is no child-process/job handle for the whole run and no
// AbortController threaded through it, so a real "kill this run" primitive
// doesn't exist for most of it. Cancellation is therefore cooperative: the
// cancel API (POST /api/runs/[id]/cancel) flips run.status to "cancelled"
// out-of-band, and this function calls isCancelled() right after every
// `await` (the only points where a concurrent request can actually
// interleave — everything between two awaits runs synchronously on Node's
// single thread) before writing its own "succeeded"/"failed" status, so it
// stops advancing instead of clobbering the cancellation. The one stage that
// *can* be forced for real is the sandbox container: the cancel API removes
// it directly (`docker rm -f`), which also makes an in-flight Ansible
// docker-exec against it fail immediately instead of running to its own
// timeout.
export async function runPipeline(
  runId: string,
  source: RunSource,
  deps: PipelineDeps = defaultDeps,
  db: Database = getDb(),
  options: { categories?: string[] } = {},
): Promise<void> {
  markRunStarted(runId, db);
  let imageTag: string;
  let dockerfilePath: string | undefined;
  // Hoisted so it's reachable from the shared finally below and from every
  // early return in the git branch: whichever exit path runs, the clone
  // directory (data/repos/<runId>) gets removed at most once. A local_image
  // run never assigns this, so cleanupClone() is a no-op for it.
  let repoDir: string | undefined;
  const cleanupClone = () => {
    if (!repoDir) return;
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    repoDir = undefined;
  };

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
    try {
      const result = await deps.clone(source.repoUrl, runId);
      repoDir = result.dir;
    } catch (err) {
      if (isCancelled(runId, db)) return;
      updateRunStage(runId, "clone", "failed", { errorMessage: errorMessage(err) }, db);
      return;
    }
    if (isCancelled(runId, db)) {
      cleanupClone();
      return;
    }
    updateRunStage(runId, "clone", "succeeded", {}, db);

    if (source.dockerfilePath) {
      const specified = path.join(repoDir, source.dockerfilePath);
      const resolved = path.resolve(repoDir, source.dockerfilePath);
      const repoRoot = path.resolve(repoDir);
      if (resolved !== repoRoot && !resolved.startsWith(repoRoot + path.sep)) {
        updateRunStage(
          runId,
          "build",
          "failed",
          { errorMessage: `지정된 Dockerfile 경로가 유효하지 않습니다: ${source.dockerfilePath}` },
          db,
        );
        cleanupClone();
        return;
      }
      if (!fs.existsSync(specified)) {
        updateRunStage(
          runId,
          "build",
          "failed",
          { errorMessage: `지정된 Dockerfile을 찾을 수 없습니다: ${source.dockerfilePath}` },
          db,
        );
        cleanupClone();
        return;
      }
      dockerfilePath = specified;
    } else {
      dockerfilePath = deps.detectDockerfile(repoDir);
      if (!dockerfilePath) {
        updateRunStage(
          runId,
          "build",
          "failed",
          { errorMessage: "Dockerfile을 찾을 수 없습니다 (레포 전체 탐색)" },
          db,
        );
        cleanupClone();
        return;
      }
    }

    updateRunStage(runId, "build", "running", {}, db);
    imageTag = `scan-${runId}`;
    try {
      await deps.build(dockerfilePath, imageTag);
    } catch (err) {
      if (isCancelled(runId, db)) {
        cleanupClone();
        return;
      }
      updateRunStage(runId, "build", "failed", { errorMessage: errorMessage(err) }, db);
      cleanupClone();
      return;
    }
    if (isCancelled(runId, db)) {
      cleanupClone();
      return;
    }
    updateRunStage(
      runId,
      "build",
      "succeeded",
      { imageTag, message: `Dockerfile: ${path.relative(repoDir, dockerfilePath)}` },
      db,
    );
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
      if (isCancelled(runId, db)) return;
      updateRunStage(runId, "sandbox", "failed", { errorMessage: errorMessage(err) }, db);
      return;
    }
    if (isCancelled(runId, db)) {
      // The container is up but its name was never persisted (we're
      // returning before the "sandbox succeeded" write below) — stop it
      // ourselves using the local variable so it isn't orphaned.
      await deps.stopSandbox(containerName);
      return;
    }
    updateRunStage(runId, "sandbox", "succeeded", { containerName }, db);
    // Safety net in case the ansible step below hangs or this process is
    // killed before it finishes; cancelled once we're done with the container.
    const sandboxTimeout = deps.scheduleSandboxTimeout(runId, containerName, undefined, undefined, db);

    updateRunStage(runId, "ansible", "running", {}, db);
    const assetId = (
      db.prepare(`SELECT asset_id FROM runs WHERE id = ?`).get(runId) as
        | { asset_id: string | null }
        | undefined
    )?.asset_id ?? null;
    const asset = assetId ? getAsset(assetId, db) : undefined;
    let results;
    try {
      results = await deps.runChecks(dockerfilePath, containerName, asset, options.categories);
    } catch (err) {
      clearTimeout(sandboxTimeout);
      await deps.stopSandbox(containerName);
      if (isCancelled(runId, db)) return;
      updateRunStage(runId, "ansible", "failed", { errorMessage: errorMessage(err) }, db);
      return;
    }
    clearTimeout(sandboxTimeout);
    await deps.stopSandbox(containerName);
    if (isCancelled(runId, db)) return;
    updateRunStage(runId, "ansible", "succeeded", {}, db);

    updateRunStage(runId, "rule_eval", "running", {}, db);
    saveCheckResults(runId, results, db);
    // autodetect 스캔 결과로 레포 자산의 실질 구분을 보정 저장(best-effort — 실패해도 스캔 불변).
    try {
      const assetId = getRun(runId, db)?.assetId;
      if (assetId) {
        const asset = getAsset(assetId, db);
        if (asset?.type === "repo") {
          const detected = detectKindFromResults(results);
          if (detected) updateAssetCategory(assetId, detected, db);
        }
      }
    } catch {
      /* 보정 실패는 무시 */
    }
    updateRunStage(runId, "rule_eval", "succeeded", {}, db);

    updateRunStage(runId, "claude", "running", {}, db);
    try {
      await deps.analyzeChecks(runId, results, db);
    } catch (err) {
      if (isCancelled(runId, db)) return;
      // AI failure is independent of check failure: check_results above are
      // already committed and stay queryable even if analysis fails here.
      updateRunStage(runId, "claude", "failed", { errorMessage: errorMessage(err) }, db);
      return;
    }
    if (isCancelled(runId, db)) return;
    updateRunStage(runId, "claude", "succeeded", {}, db);
    updateRunStage(runId, "done", "succeeded", {}, db);
  } finally {
    if (source.type === "git") {
      await deps.removeImage(imageTag);
    }
    cleanupClone();
  }
}
