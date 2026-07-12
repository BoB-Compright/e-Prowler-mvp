import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function jsonRequest(method: string, body: unknown, cookie?: string): Request {
  return new Request("http://localhost/api/settings/ai-analysis", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("tester", "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("/api/settings/ai-analysis", () => {
  it("requires a session for GET and PUT", async () => {
    const { GET, PUT } = await import("./route");
    expect((await GET(jsonRequest("GET", undefined))).status).toBe(401);
    expect((await PUT(jsonRequest("PUT", { enabled: true }))).status).toBe(401);
  });

  it("defaults to disabled, then reflects a PUT toggle", async () => {
    const { GET, PUT } = await import("./route");
    const cookie = await authCookie();

    const before = await GET(jsonRequest("GET", undefined, cookie));
    expect(await before.json()).toEqual({ enabled: false });

    const put = await PUT(jsonRequest("PUT", { enabled: true }, cookie));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ enabled: true });

    const after = await GET(jsonRequest("GET", undefined, cookie));
    expect(await after.json()).toEqual({ enabled: true });
  });

  it("rejects a non-boolean enabled", async () => {
    const { PUT } = await import("./route");
    const cookie = await authCookie();
    const res = await PUT(jsonRequest("PUT", { enabled: "yes" }, cookie));
    expect(res.status).toBe(400);
  });
});
