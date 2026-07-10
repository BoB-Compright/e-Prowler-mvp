import { describe, expect, it, vi, beforeEach } from "vitest";

const execFileMock = vi.fn((cmd: string, args: string[], ...rest: unknown[]) => {
  const cb = rest[rest.length - 1] as (err: unknown, result?: unknown) => void;
  if (args[0] === "inspect") {
    cb(null, { stdout: "true\n", stderr: "" });
    return;
  }
  cb(null, { stdout: "", stderr: "" });
});

vi.mock("child_process", () => ({
  execFile: (cmd: string, args: string[], ...rest: unknown[]) =>
    execFileMock(cmd, args, ...rest),
}));

describe("startSandbox", () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it("runs docker run with a keep-alive entrypoint/cmd override instead of the image default", async () => {
    const { startSandbox, DEFAULT_SANDBOX_LIMITS } = await import("./sandbox");
    await startSandbox("scan-image:latest", "scan-container-1");

    const runCall = execFileMock.mock.calls.find((call) => call[1][0] === "run");
    expect(runCall).toBeDefined();
    const [cmd, args] = runCall!;
    expect(cmd).toBe("docker");
    expect(args).toEqual([
      "run",
      "-d",
      "--entrypoint",
      "sh",
      "--name",
      "scan-container-1",
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "CHOWN",
      "--memory",
      DEFAULT_SANDBOX_LIMITS.memory,
      "--pids-limit",
      String(DEFAULT_SANDBOX_LIMITS.pidsLimit),
      "scan-image:latest",
      "-c",
      "while true; do sleep 3600; done",
    ]);
  });

  it("does not pass -t", async () => {
    const { startSandbox } = await import("./sandbox");
    await startSandbox("scan-image:latest", "scan-container-2");

    const runCall = execFileMock.mock.calls.find((call) => call[1][0] === "run");
    const args = runCall![1] as string[];
    expect(args).not.toContain("-t");
  });

  it("overrides entrypoint and ends with the keep-alive command, with imageTag immediately before -c", async () => {
    const { startSandbox } = await import("./sandbox");
    await startSandbox("scan-image:latest", "scan-container-3");

    const runCall = execFileMock.mock.calls.find((call) => call[1][0] === "run");
    const args = runCall![1] as string[];

    expect(args).toContain("--entrypoint");
    expect(args).toContain("sh");

    const imageIdx = args.indexOf("scan-image:latest");
    expect(imageIdx).toBeGreaterThan(-1);
    expect(args[imageIdx + 1]).toBe("-c");
    expect(args[imageIdx + 2]).toBe("while true; do sleep 3600; done");
    expect(args.slice(-2)).toEqual(["-c", "while true; do sleep 3600; done"]);
  });
});
