import type { Database } from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { cancelRun, createRun, getRun, listRunEvents } from "./runs";
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
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("done");
    expect(updated.status).toBe("succeeded");
    expect(updated.containerName).toBe(`scan-${run.id}`);

    expect(deps.build).toHaveBeenCalledWith("/tmp/fake-repo/Dockerfile", `scan-${run.id}`);
    expect(deps.runChecks).toHaveBeenCalledWith("/tmp/fake-repo/Dockerfile", `scan-${run.id}`, undefined);
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
      { id: "C-01", status: "fail", evidence: "uid 0", frameworkId: "kisa", source: "rule" },
      { id: "C-02", status: "pass", evidence: "no secrets", frameworkId: "kisa", source: "rule" },
      { id: "U-16", status: "pass", evidence: "root:root 644", frameworkId: "kisa", source: "rule" },
    ]);
  });

  it("fails the run at the claude stage when analysis throws, keeping check results intact", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
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
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
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
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
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
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
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
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
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
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
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
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.build = vi.fn().mockRejectedValue(new Error("docker build exited 1"));

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    expect(deps.removeImage).not.toHaveBeenCalled();
  });

  it("skips clone/build for a local_image source and scans the chosen image directly (#41)", async () => {
    const run = createRun("nginx:latest", "local_image", null, db);
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
    // The third arg (asset) is also undefined here since this run has no asset_id.
    expect(deps.runChecks).toHaveBeenCalledWith(undefined, `scan-${run.id}`, undefined);
    // A local_image run reuses an image the user owns and must never delete it.
    expect(deps.removeImage).not.toHaveBeenCalled();
  });

  it("builds using a Dockerfile found in a subdirectory and records its relative path", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockResolvedValue({ dir: "/tmp/fake-repo" });
    deps.detectDockerfile = vi.fn().mockReturnValue("/tmp/fake-repo/docker/Dockerfile");

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("succeeded");
    // build 는 (dockerfilePath, imageTag) 로 호출된다.
    expect(deps.build).toHaveBeenCalledWith(
      "/tmp/fake-repo/docker/Dockerfile",
      `scan-${run.id}`,
    );
    // runChecks 는 선택된 Dockerfile 경로를 받는다.
    expect(deps.runChecks).toHaveBeenCalledWith(
      "/tmp/fake-repo/docker/Dockerfile",
      `scan-${run.id}`,
      undefined,
    );
    // build-stage succeeded event의 message에 상대경로가 기록된다.
    const events = listRunEvents(run.id, db);
    const buildSucceededEvent = events.find((e) => e.stage === "build" && e.status === "succeeded");
    expect(buildSucceededEvent).toBeDefined();
    expect(buildSucceededEvent?.message).toBe("Dockerfile: docker/Dockerfile");
  });

  it("source.dockerfilePath가 지정되면 자동탐색 대신 그 경로로 빌드한다", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-"));
    fs.mkdirSync(path.join(dir, "backend"));
    fs.writeFileSync(path.join(dir, "backend", "Dockerfile"), "FROM scratch\n");
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockResolvedValue({ dir });
    deps.detectDockerfile = vi.fn();
    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl, dockerfilePath: "backend/Dockerfile" }, deps, db);
    expect(deps.detectDockerfile).not.toHaveBeenCalled();
    expect(deps.build).toHaveBeenCalledWith(path.join(dir, "backend", "Dockerfile"), `scan-${run.id}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("지정된 dockerfilePath가 clone 결과에 없으면 build 실패", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-"));
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockResolvedValue({ dir });
    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl, dockerfilePath: "nope/Dockerfile" }, deps, db);
    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/지정된 Dockerfile을 찾을 수 없습니다/);
    expect(deps.build).not.toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("source.dockerfilePath가 repoDir를 벗어나면(경로 탈출) build 실패이며 build를 호출하지 않는다", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-"));
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockResolvedValue({ dir });
    await runPipeline(
      run.id,
      { type: "git", repoUrl: run.repoUrl, dockerfilePath: "../evil/Dockerfile" },
      deps,
      db,
    );
    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("build");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/유효하지 않습니다/);
    expect(deps.build).not.toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("git run 성공 후 클론 디렉터리를 삭제한다", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clone-"));
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    const run = createRun("https://github.com/o/r.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockResolvedValue({ dir });
    deps.detectDockerfile = vi.fn().mockReturnValue(path.join(dir, "Dockerfile"));
    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("git run이 build 단계에서 실패해도 클론을 삭제한다", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clone-"));
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch\n");
    const run = createRun("https://github.com/o/r.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockResolvedValue({ dir });
    deps.detectDockerfile = vi.fn().mockReturnValue(path.join(dir, "Dockerfile"));
    deps.build = vi.fn().mockRejectedValue(new Error("docker build exited 1"));
    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("파이프라인 실행 시작 시 started_at을 기록한다", async () => {
    const run = createRun("https://example.com/repo.git", "git", null, db);
    expect(getRun(run.id, db)!.startedAt).toBeNull();
    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, baseDeps(), db);
    const updated = getRun(run.id, db)!;
    expect(updated.startedAt).not.toBeNull();
    expect(updated.finishedAt).not.toBeNull();
  });
});

// (#73) The orchestrator has no way to forcibly abort an in-flight `await` in
// this fire-and-forget, single-process pipeline — there's no cancellation
// token/AbortController threaded through it. Cancellation is therefore
// cooperative: the cancel API flips run.status to "cancelled" out-of-band
// (simulated below by calling cancelRun from inside a dep mock, mid-await,
// exactly as the real cancel endpoint would race with a real in-flight
// step), and the pipeline checks isCancelled() at each stage boundary (right
// after every await resolves/rejects) before writing its own status — so it
// stops advancing and never clobbers "cancelled" back to "running"/
// "succeeded"/"failed".
describe("runPipeline cancellation (#73)", () => {
  it("stops before build once cancelled during clone, without advancing the stage", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.clone = vi.fn().mockImplementation(async () => {
      cancelRun(run.id, "사용자가 취소", db);
      return { dir: "/tmp/fake-repo" };
    });

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");
    expect(updated.stage).toBe("clone");
    expect(deps.detectDockerfile).not.toHaveBeenCalled();
    expect(deps.build).not.toHaveBeenCalled();
  });

  it("stops before sandbox once cancelled during build, without advancing the stage", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.build = vi.fn().mockImplementation(async () => {
      cancelRun(run.id, "사용자가 취소", db);
      return undefined;
    });

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");
    expect(updated.stage).toBe("build");
    expect(deps.startSandbox).not.toHaveBeenCalled();
  });

  it("force-stops the sandbox container it just started when cancelled mid-startSandbox", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.startSandbox = vi.fn().mockImplementation(async () => {
      cancelRun(run.id, "사용자가 취소", db);
      return { containerName: `scan-${run.id}` };
    });

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");
    expect(updated.stage).toBe("sandbox");
    // Cleanup happens even though the "sandbox succeeded" write never
    // landed (and so run.containerName was never persisted) — the
    // orchestrator still holds the containerName locally and stops it.
    expect(deps.stopSandbox).toHaveBeenCalledWith(`scan-${run.id}`);
    expect(deps.runChecks).not.toHaveBeenCalled();
  });

  it("stops after ansible checks resolve once cancelled mid-check, without saving results or advancing to rule_eval", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.runChecks = vi.fn().mockImplementation(async () => {
      cancelRun(run.id, "사용자가 취소", db);
      return [{ id: "C-01", status: "fail", evidence: "uid 0" }];
    });

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");
    expect(updated.stage).toBe("ansible");
    // Normal cleanup (container stop) still runs regardless of cancellation.
    expect(deps.stopSandbox).toHaveBeenCalledWith(`scan-${run.id}`);
    expect(listCheckResults(run.id, db)).toEqual([]);
    expect(deps.analyzeChecks).not.toHaveBeenCalled();
  });

  it("does not overwrite a cancelled run with 'failed' when the in-flight ansible step errors after cancellation", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.runChecks = vi.fn().mockImplementation(async () => {
      cancelRun(run.id, "사용자가 취소", db);
      throw new Error("ansible-playbook exited 4 (container removed mid-run)");
    });

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled"); // not "failed"
    expect(deps.stopSandbox).toHaveBeenCalledWith(`scan-${run.id}`);
  });

  it("stops after claude analysis resolves once cancelled mid-analysis, without marking the run done", async () => {
    const run = createRun("https://github.com/owner/repo.git", "git", null, db);
    const deps = baseDeps();
    deps.analyzeChecks = vi.fn().mockImplementation(async () => {
      cancelRun(run.id, "사용자가 취소", db);
      return undefined;
    });

    await runPipeline(run.id, { type: "git", repoUrl: run.repoUrl }, deps, db);

    const updated = getRun(run.id, db)!;
    expect(updated.status).toBe("cancelled");
    expect(updated.stage).toBe("claude");
  });
});
