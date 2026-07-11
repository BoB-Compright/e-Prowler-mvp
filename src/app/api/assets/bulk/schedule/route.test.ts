import { randomBytes, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets/bulk/schedule", {
    method: "POST",
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

describe("POST /api/assets/bulk/schedule", () => {
  it("세션 없으면 401", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a"], frequency: "daily" }));
    expect(res.status).toBe(401);
  });

  it("빈 assetIds·잘못된 frequency는 400", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    expect((await POST(jsonRequest({ assetIds: [], frequency: "daily" }, cookie))).status).toBe(400);
    expect((await POST(jsonRequest({ assetIds: ["a"], frequency: "hourly" }, cookie))).status).toBe(400);
  });

  it("frequency를 일괄 적용하고, null이면 스케줄을 해제한다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { getScheduleByAsset } = await import("@/lib/scheduling/store");
    const a1 = createRepoAsset({ displayName: "r1", repoUrl: "https://github.com/x/r1" });
    const a2 = createRepoAsset({ displayName: "r2", repoUrl: "https://github.com/x/r2" });
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(jsonRequest({ assetIds: [a1.id, a2.id], frequency: "weekly" }, cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    expect(getScheduleByAsset(a1.id)?.frequency).toBe("weekly");
    expect(getScheduleByAsset(a1.id)?.enabled).toBe(true);

    const res2 = await POST(jsonRequest({ assetIds: [a1.id], frequency: null }, cookie));
    expect(await res2.json()).toEqual({ updated: 1 });
    expect(getScheduleByAsset(a1.id)).toBeUndefined();
  });

  it("존재하지 않는 자산은 건너뛴다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const a = createRepoAsset({ displayName: "r", repoUrl: "https://github.com/x/r" });
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [a.id, "nope"], frequency: "daily" }, await authCookie()));
    expect(await res.json()).toEqual({ updated: 1 });
  });
});
