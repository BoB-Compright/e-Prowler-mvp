import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun, getRun } from "./runs";
import { listCheckResults } from "@/lib/checks/store";
import { runPipeline, type PipelineDeps } from "./orchestrator";

let db: Database;

function baseDeps(): PipelineDeps {
  return {
    clone: vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" }),
    detectDockerfile: vi.fn().mockReturnValue("/tmp/fake-repo/Dockerfile"),
    build: vi.fn().mockResolvedValue(undefined),
    removeImage: vi.fn().mockResolvedValue(undefined),
    startSandbox: vi.fn().mockResolvedValue({ containerName: "fake-container" }),
    stopSandbox: vi.fn().mockResolvedValue(undefined),
    scheduleSandboxTimeout: vi.fn(),
    runChecks: vi
      .fn()
      .mockResolvedValue([
        { id: "C-01", status: "fail", evidence: "uid 0" },
        { id: "C-02", status: "pass", evidence: "no secrets" },
        { id: "U-16", status: "pass", evidence: "root:root 644" },
      ]),
    analyzeChecks: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  db = createInMemoryDb();
});

describe("runPipeline", () => {
  it("runs the full pipeline through claude analysis and marks the run done", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("done");
    expect(updated.status).toBe("succeeded");
    expect(updated.containerName).toBe(`scan-${run.id}`);

    expect(deps.runChecks).toHaveBeenCalledWith("/tmp/fake-repo/Dockerfile", `scan-${run.id}`);
    expect(deps.stopSandbox).toHaveBeenCalledWith(`scan-${run.id}`);
    // A git-sourced run's one-off scan-<runId> image is cleaned up once the
    // pipeline is done with it, unlike a reused local_image (see below).
    expect(deps.removeImage).toHaveBeenCalledWith(`scan-${run.id}`);
    expect(deps.analyzeChecks).toHaveBeenCalledWith(
      run.id,
      [
        { id: "C-01", status: "fail", evidence: "uid 0" },
        { id: "C-02", status: "pass", evidence: "no secrets" },
        { id: "U-16", status: "pass", evidence: "root:root 644" },
      ],
      db,
    );

    const results = listCheckResults(run.id, db);
    expect(results).toEqual([
      { id: "C-01", status: "fail", evidence: "uid 0" },
      { id: "C-02", status: "pass", evidence: "no secrets" },
      { id: "U-16", status: "pass", evidence: "root:root 644" },
    ]);
  });

  it("fails the run at the claude stage when analysis throws, keeping check results intact", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();
    deps.analyzeChecks = vi.fn().mockRejectedValue(new Error("ANTHROPIC_API_KEY missing"));

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("claude");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("ANTHROPIC_API_KEY missing");

    // Check results committed during rule_eval must survive an AI failure.
    expect(listCheckResults(run.id, db)).toHaveLength(3);
  });

  it("fails the run at the clone stage when clone throws", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockRejectedValue(new Error("repository not found"));

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("clone");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("repository not found");
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("fails at the build stage when no Dockerfile is found", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();
    deps.detectDockerfile = vi.fn().mockReturnValue(undefined);

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/Dockerfile/);
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("fails the run at the build stage when docker build throws", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();
    deps.build = vi.fn().mockRejectedValue(new Error("docker build exited 1"));

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("docker build exited 1");
    expect(updated.imageTag).toBeNull();
    expect(deps.startSandbox).not.toHaveBeenCalled();
  });

  it("fails the run at the sandbox stage when the container does not stay up", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();
    deps.startSandbox = vi.fn().mockRejectedValue(new Error("컨테이너가 시작 직후 종료되었습니다"));

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("sandbox");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/종료/);
    expect(deps.scheduleSandboxTimeout).not.toHaveBeenCalled();
    expect(deps.runChecks).not.toHaveBeenCalled();
    // The image was already built successfully before sandbox startup
    // failed, so it still needs cleaning up.
    expect(deps.removeImage).toHaveBeenCalledWith(`scan-${run.id}`);
  });

  it("fails the run at the ansible stage and still stops the sandbox when checks throw", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();
    deps.runChecks = vi.fn().mockRejectedValue(new Error("ansible-playbook exited 4"));

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("ansible");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("ansible-playbook exited 4");
    expect(deps.stopSandbox).toHaveBeenCalledWith(`scan-${run.id}`);
    expect(listCheckResults(run.id, db)).toEqual([]);
    expect(deps.removeImage).toHaveBeenCalledWith(`scan-${run.id}`);
  });

  it("does not remove the build artifact for a build-stage failure (nothing was ever built)", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", db);
    const deps = baseDeps();
    deps.build = vi.fn().mockRejectedValue(new Error("docker build exited 1"));

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    expect(deps.removeImage).not.toHaveBeenCalled();
  });

  it("skips clone/build for a local_image source and scans the chosen image directly (#41)", async () => {
    const run = createRun("nginx:latest", "local_image", db);
    const deps = baseDeps();

    await runPipeline(run.id, { type: "local_image", imageTag: "nginx:latest" }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("done");
    expect(updated.status).toBe("succeeded");
    expect(updated.imageTag).toBe("nginx:latest");

    expect(deps.clone).not.toHaveBeenCalled();
    expect(deps.detectDockerfile).not.toHaveBeenCalled();
    expect(deps.build).not.toHaveBeenCalled();
    expect(deps.startSandbox).toHaveBeenCalledWith("nginx:latest", `scan-${run.id}`);
    // No Dockerfile is available for a local image, so runChecks gets undefined.
    expect(deps.runChecks).toHaveBeenCalledWith(undefined, `scan-${run.id}`);
    // A local_image run reuses an image the user owns and must never delete it.
    expect(deps.removeImage).not.toHaveBeenCalled();
  });
});
