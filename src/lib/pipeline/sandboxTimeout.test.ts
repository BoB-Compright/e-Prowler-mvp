import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRun, getRun, updateRunStage } from "./runs";
import { scheduleSandboxTimeout, type SandboxTimeoutDeps } from "./sandboxTimeout";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleSandboxTimeout", () => {
  it("stops the container and fails the run if still in the sandbox stage when it fires", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    updateRunStage(run.id, "sandbox", "succeeded", { containerName: "scan-x" }, db);

    const deps: SandboxTimeoutDeps = { stopSandbox: vi.fn().mockResolvedValue(undefined) };
    scheduleSandboxTimeout(run.id, "scan-x", 1000, deps, db);

    await vi.advanceTimersByTimeAsync(1000);

    expect(deps.stopSandbox).toHaveBeenCalledWith("scan-x");
    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("sandbox");
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toMatch(/시간 제한/);
  });

  it("does nothing if a later stage already moved the run past sandbox", async () => {
    const run = createRun("https://github.com/owner/repo.git", db);
    updateRunStage(run.id, "sandbox", "succeeded", { containerName: "scan-x" }, db);
    updateRunStage(run.id, "ansible", "running", {}, db);

    const deps: SandboxTimeoutDeps = { stopSandbox: vi.fn().mockResolvedValue(undefined) };
    scheduleSandboxTimeout(run.id, "scan-x", 1000, deps, db);

    await vi.advanceTimersByTimeAsync(1000);

    expect(deps.stopSandbox).not.toHaveBeenCalled();
    const updated = getRun(run.id, db)!;
    expect(updated.stage).toBe("ansible");
    expect(updated.status).toBe("running");
  });
});
