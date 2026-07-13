import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function req(cookie?: string): Request {
  return new Request("http://localhost/api/cve/scan", { method: "POST", headers: cookie ? { cookie } : undefined });
}
async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("t", "pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/cve/scan", () => {
  it("401 without session", async () => {
    const { POST } = await import("./route");
    expect((await POST(req())).status).toBe(401);
  });

  it("runs a delta cycle and returns ok", async () => {
    // deltaWatcher.runDeltaCycle을 목으로 대체
    vi.doMock("@/lib/cve/deltaWatcher", () => ({ runDeltaCycle: vi.fn().mockResolvedValue(undefined) }));
    const { POST } = await import("./route");
    const res = await POST(req(await authCookie()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
