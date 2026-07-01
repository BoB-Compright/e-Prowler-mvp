import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface SandboxLimits {
  memory: string; // e.g. "256m"
  pidsLimit: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  memory: "256m",
  pidsLimit: 100,
};

export interface SandboxHandle {
  containerName: string;
}

// Starts imageTag as a detached, resource- and permission-restricted
// container so a later stage (Ansible, #39) can attach to it via
// `docker exec` while it stays isolated from the host and network.
export async function startSandbox(
  imageTag: string,
  containerName: string,
  limits: SandboxLimits = DEFAULT_SANDBOX_LIMITS,
): Promise<SandboxHandle> {
  await execFileAsync(
    "docker",
    [
      "run",
      "-d",
      // Allocate a pseudo-TTY so images whose default CMD is an interactive
      // shell (e.g. plain `bash`, common on base OS images like debian) don't
      // read EOF on unattached stdin and exit immediately.
      "-t",
      "--name",
      containerName,
      "--network",
      "none",
      // No --read-only: many real service images (nginx, etc.) write a
      // pidfile or runtime state to an arbitrary app-specific path at
      // startup and fail immediately under a read-only rootfs. The
      // container is removed right after Ansible reads it (see
      // orchestrator.ts), so a writable layer here doesn't persist risk;
      // --network none and --cap-drop ALL remain the load-bearing controls.
      "--cap-drop",
      "ALL",
      "--memory",
      limits.memory,
      "--pids-limit",
      String(limits.pidsLimit),
      imageTag,
    ],
    { timeout: 30_000 },
  );

  const running = await isContainerRunning(containerName);
  if (!running) {
    const logs = await getContainerLogs(containerName).catch(() => "");
    throw new Error(
      `컨테이너가 시작 직후 종료되었습니다${logs ? `: ${logs.slice(-500)}` : ""}`,
    );
  }

  return { containerName };
}

export async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "--format",
      "{{.State.Running}}",
      containerName,
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function getContainerLogs(containerName: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync("docker", ["logs", containerName]);
  return `${stdout}${stderr}`;
}

// Stops and removes the sandbox container. Safe to call even if it is
// already gone (e.g. it crashed or was already cleaned up).
export async function stopSandbox(containerName: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 15_000 }).catch(
    () => undefined,
  );
}
