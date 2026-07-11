import { randomBytes, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets/bulk/project", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser(`tester-${randomUUID()}`, "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("PATCH /api/assets/bulk/project", () => {
  it("세션 없으면 401", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(jsonRequest({ assetIds: ["a"], projectId: null }));
    expect(res.status).toBe(401);
  });

  it("빈 assetIds는 400", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(jsonRequest({ assetIds: [], projectId: null }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("존재하지 않는 projectId는 400", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const a = createRepoAsset({ displayName: "r", repoUrl: "https://github.com/x/r" });
    const { PATCH } = await import("./route");
    const res = await PATCH(jsonRequest({ assetIds: [a.id], projectId: "nope" }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("소속을 일괄 변경하고 updated를 반환한다 (null=소속 해제)", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createProject } = await import("@/lib/projects/store");
    const p = createProject({ name: "p", pmName: "pm", pmEmail: "", sharePassword: "pw123456" });
    const a1 = createRepoAsset({ displayName: "r1", repoUrl: "https://github.com/x/r1" });
    const a2 = createRepoAsset({ displayName: "r2", repoUrl: "https://github.com/x/r2" });
    const { PATCH } = await import("./route");

    const res = await PATCH(jsonRequest({ assetIds: [a1.id, a2.id], projectId: p.id }, await authCookie()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });

    const { getAsset } = await import("@/lib/assets/store");
    expect(getAsset(a1.id)?.projectId).toBe(p.id);

    const res2 = await PATCH(jsonRequest({ assetIds: [a1.id], projectId: null }, await authCookie()));
    expect(await res2.json()).toEqual({ updated: 1 });
    expect(getAsset(a1.id)?.projectId).toBeNull();
  });
});
