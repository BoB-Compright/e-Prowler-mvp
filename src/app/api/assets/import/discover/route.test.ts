import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// route.ts calls out to cloneRepo/listDockerfiles (real git + filesystem
// traversal) and fs.rmSync (temp-clone cleanup). Mocking them keeps this test
// fast and hermetic — no network access, no real clone, no disk writes.
const cloneRepoMock = vi.fn();
const listDockerfilesMock = vi.fn();
const rmSyncMock = vi.fn();

vi.mock("@/lib/pipeline/clone", () => ({
  cloneRepo: (...args: unknown[]) => cloneRepoMock(...args),
}));

vi.mock("@/lib/pipeline/dockerfile", () => ({
  listDockerfiles: (...args: unknown[]) => listDockerfilesMock(...args),
}));

// Keep the real fs module for everything the rest of the app needs (the
// in-memory DB path skips fs entirely, but other modules may still touch it)
// and only intercept rmSync so we can assert the temp clone gets deleted.
vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const rmSync = (...args: unknown[]) => rmSyncMock(...args);
  return {
    ...actual,
    default: { ...(actual.default as Record<string, unknown>), rmSync },
    rmSync,
  };
});

// route.ts (and the lib modules it calls) reach the shared getDb() singleton,
// which is created lazily from process.env.DATABASE_PATH. Resetting the
// module registry + pointing DATABASE_PATH at ":memory:" before each test
// gives every test its own isolated in-memory database.
beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
  cloneRepoMock.mockReset();
  listDockerfilesMock.mockReset();
  rmSyncMock.mockReset();
});

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets/import/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("tester", "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/assets/import/discover — session guard", () => {
  it("returns 401 without any session cookie", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ repoUrl: "https://github.com/x/x" }));
    expect(res.status).toBe(401);
    expect(cloneRepoMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/assets/import/discover", () => {
  it("clone 후 Dockerfile 상대경로 목록을 반환하고 임시 클론을 삭제한다", async () => {
    cloneRepoMock.mockResolvedValue({ dir: "/tmp/x" });
    listDockerfilesMock.mockReturnValue(["/tmp/x/backend/Dockerfile", "/tmp/x/a/Dockerfile"]);

    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(jsonRequest({ repoUrl: "https://github.com/x/test" }, cookie));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ dockerfiles: ["backend/Dockerfile", "a/Dockerfile"], registered: {} });

    expect(rmSyncMock).toHaveBeenCalledWith("/tmp/x", { recursive: true, force: true });
  });

  it("이미 등록된 Dockerfile은 소속 프로젝트 정보와 함께 registered로 표시한다", async () => {
    cloneRepoMock.mockResolvedValue({ dir: "/tmp/x" });
    listDockerfilesMock.mockReturnValue(["/tmp/x/backend/Dockerfile", "/tmp/x/frontend/Dockerfile"]);

    const { createProject } = await import("@/lib/projects/store");
    const { createRepoAsset } = await import("@/lib/assets/store");
    const project = createProject({
      name: "기존프로젝트",
      pmName: "pm",
      pmEmail: "pm@test.com",
      sharePassword: "pw123456",
    });
    createRepoAsset({
      displayName: "test / backend/Dockerfile",
      repoUrl: "https://github.com/x/test",
      projectId: project.id,
      dockerfilePath: "backend/Dockerfile",
    });

    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(jsonRequest({ repoUrl: "https://github.com/x/test" }, cookie));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dockerfiles).toEqual(["backend/Dockerfile", "frontend/Dockerfile"]);
    expect(body.registered).toEqual({
      "backend/Dockerfile": { projectId: project.id, projectName: "기존프로젝트" },
    });
  });

  it("유효하지 않은 레포 URL이면 400을 반환하고 clone을 시도하지 않는다", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(jsonRequest({ repoUrl: "not-a-url" }, cookie));

    expect(res.status).toBe(400);
    expect(cloneRepoMock).not.toHaveBeenCalled();
    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it("clone이 실패하면 400을 반환한다 (삭제할 임시 클론이 없으므로 rmSync는 호출되지 않는다)", async () => {
    cloneRepoMock.mockRejectedValue(new Error("clone failed: repository not found"));

    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(jsonRequest({ repoUrl: "https://github.com/x/missing" }, cookie));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("clone failed: repository not found");
    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it("clone 이후 실패해도 임시 클론을 삭제한다", async () => {
    cloneRepoMock.mockResolvedValue({ dir: "/tmp/y" });
    listDockerfilesMock.mockImplementation(() => {
      throw new Error("scan failed");
    });

    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(jsonRequest({ repoUrl: "https://github.com/x/test" }, cookie));

    expect(res.status).toBe(400);
    expect(rmSyncMock).toHaveBeenCalledWith("/tmp/y", { recursive: true, force: true });
  });
});
