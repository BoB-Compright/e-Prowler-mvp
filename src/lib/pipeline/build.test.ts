import { describe, expect, it, vi, beforeEach } from "vitest";

const execFileMock = vi.fn(
  (_cmd: string, _args: string[], _opts: unknown, cb: (err: unknown) => void) => cb(null),
);

vi.mock("child_process", () => ({
  execFile: (cmd: string, args: string[], opts: unknown, cb: (err: unknown) => void) =>
    execFileMock(cmd, args, opts, cb),
}));

describe("buildImage", () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it("runs docker build with -f pointing at the given Dockerfile and repoDir as context", async () => {
    const { buildImage } = await import("./build");
    await buildImage("/repo", "/repo/docker/Dockerfile", "scan-123");

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileMock.mock.calls[0];
    expect(cmd).toBe("docker");
    expect(args).toEqual(["build", "-t", "scan-123", "-f", "/repo/docker/Dockerfile", "/repo"]);
  });
});
