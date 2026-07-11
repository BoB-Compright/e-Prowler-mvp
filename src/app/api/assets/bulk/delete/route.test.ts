import { randomBytes, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets/bulk/delete", {
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

describe("POST /api/assets/bulk/delete", () => {
  it("세션 없으면 401", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a"] }));
    expect(res.status).toBe(401);
  });

  it("빈 assetIds는 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [] }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("삭제하고, 실행 중 점검이 있는 자산은 skipped로 보고한다", async () => {
    const { createRepoAsset, getAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const busy = createRepoAsset({ displayName: "busy", repoUrl: "https://github.com/x/busy" });
    const idle = createRepoAsset({ displayName: "idle", repoUrl: "https://github.com/x/idle" });
    createRun(busy.repoUrl!, "git", busy.id); // running 상태

    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [busy.id, idle.id, "nope"] }, await authCookie()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1, skipped: [busy.id] });
    expect(getAsset(idle.id)).toBeUndefined();
    expect(getAsset(busy.id)).toBeDefined();
  });
});
