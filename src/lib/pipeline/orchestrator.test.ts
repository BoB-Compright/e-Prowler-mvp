import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun, getRun } from "./runs";
import { runPipeline, type PipelineDeps } from "./orchestrator";

let db: Database;

function baseDeps(): PipelineDeps {
  return {
    clone: vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" }),
    detectDockerfile: vi.fn().mockReturnValue("/tmp/fake-repo/Dockerfile"),
    build: vi.fn().mockResolvedValue(undefined),
    startSandbox: vi.fn().mockResolvedValue({ containerName: "fake-container" }),
    scheduleSandboxTimeout: vi.fn(),
  };
}

beforeEach(() => {
  db = createInMemoryDb();
});

describe("runPipeline", () => {
  it("clones, builds, starts the sandbox, and marks the run succeeded", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps = baseDeps();

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("sandbox");
    expect(updated.status).toBe("succeeded");
    expect(updated.imageTag).toBe(`scan-${run.id}`);
    expect(updated.containerName).toBe(`scan-${run.id}`);
    expect(deps.build).toHaveBeenCalledWith("/tmp/fake-repo", `scan-${run.id}`);
    expect(deps.startSandbox).toHaveBeenCalledWith(`scan-${run.id}`, `scan-${run.id}`);
    expect(deps.scheduleSandboxTimeout).toHaveBeenCalledWith(
      run.id,
      `scan-${run.id}`,
      undefined,
      undefined,
      db,
    );
  });

  it("fails the run at the clone stage when clone throws", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockRejectedValue(new Error("repository not found"));

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("clone");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("repository not found");
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("fails at the build stage when no Dockerfile is found", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps = baseDeps();
    deps.detectDockerfile = vi.fn().mockReturnValue(undefined);

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/Dockerfile/);
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("fails the run at the build stage when docker build throws", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps = baseDeps();
    deps.build = vi.fn().mockRejectedValue(new Error("docker build exited 1"));

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("docker build exited 1");
    expect(updated.imageTag).toBeNull();
    expect(deps.startSandbox).not.toHaveBeenCalled();
  });

  it("fails the run at the sandbox stage when the container does not stay up", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps = baseDeps();
    deps.startSandbox = vi.fn().mockRejectedValue(new Error("컨테이너가 시작 직후 종료되었습니다"));

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("sandbox");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/종료/);
    expect(deps.scheduleSandboxTimeout).not.toHaveBeenCalled();
  });
});
