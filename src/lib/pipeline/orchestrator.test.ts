import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun, getRun } from "./runs";
import { runPipeline, type PipelineDeps } from "./orchestrator";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("runPipeline", () => {
  it("clones, builds, and marks the run succeeded with an image tag", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps: PipelineDeps = {
      clone: vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" }),
      detectDockerfile: vi.fn().mockReturnValue("/tmp/fake-repo/Dockerfile"),
      build: vi.fn().mockResolvedValue(undefined),
    };

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("succeeded");
    expect(updated.imageTag).toBe(`scan-${run.id}`);
    expect(deps.build).toHaveBeenCalledWith("/tmp/fake-repo", `scan-${run.id}`);
  });

  it("fails the run at the clone stage when clone throws", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps: PipelineDeps = {
      clone: vi.fn().mockRejectedValue(new Error("repository not found")),
      detectDockerfile: vi.fn(),
      build: vi.fn(),
    };

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("clone");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("repository not found");
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("fails at the build stage when no Dockerfile is found", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps: PipelineDeps = {
      clone: vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" }),
      detectDockerfile: vi.fn().mockReturnValue(undefined),
      build: vi.fn(),
    };

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/Dockerfile/);
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("fails the run at the build stage when docker build throws", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    const deps: PipelineDeps = {
      clone: vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" }),
      detectDockerfile: vi.fn().mockReturnValue("/tmp/fake-repo/Dockerfile"),
      build: vi.fn().mockRejectedValue(new Error("docker build exited 1")),
    };

    await runPipeline(run.id, run.repoUrl, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("docker build exited 1");
    expect(updated.imageTag).toBeNull();
  });
});
