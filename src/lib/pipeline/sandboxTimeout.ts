import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getRun, updateRunStage } from "./runs";
import { stopSandbox } from "./sandbox";

export const DEFAULT_SANDBOX_MAX_LIFETIME_MS = 10 * 60 * 1000;

export interface SandboxTimeoutDeps {
  stopSandbox: typeof stopSandbox;
}

const defaultDeps: SandboxTimeoutDeps = { stopSandbox };

// Safety net for a forgotten sandbox: if nothing has moved the run past the
// "sandbox" stage within timeoutMs, force-stop the container and fail the
// run. Once Ansible (#39) takes over a run, it should progress `stage` past
// "sandbox" before this fires, so this callback becomes a no-op for it.
export function scheduleSandboxTimeout(
  runId: string,
  containerName: string,
  timeoutMs: number = DEFAULT_SANDBOX_MAX_LIFETIME_MS,
  deps: SandboxTimeoutDeps = defaultDeps,
  db: Database = getDb(),
): NodeJS.Timeout {
  return setTimeout(() => {
    void (async () => {
      const run = getRun(runId, db);
      if (!run || run.stage !== "sandbox" || run.status !== "succeeded") return;
      await deps.stopSandbox(containerName);
      updateRunStage(
        runId,
        "sandbox",
        "failed",
        { errorMessage: "Sandbox 실행 시간 제한을 초과해 강제 종료되었습니다" },
        db,
      );
    })();
  }, timeoutMs);
}
