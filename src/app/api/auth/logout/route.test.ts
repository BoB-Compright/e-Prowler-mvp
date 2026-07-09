import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
});

// route.ts reads req.cookies (a NextRequest-only API, backed by RequestCookies
// parsing), so — unlike other route tests in this repo that stand in a plain
// Request — this needs an actual NextRequest.
function requestWithCookie(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/logout", {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and invalidates the session", async () => {
    const { createUser } = await import("@/lib/auth/users");
    const { createSession, verifySession } = await import("@/lib/auth/session");
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
    const user = createUser("admin", "hunter2");
    const { token } = createSession(user.id);

    const { POST } = await import("./route");
    const res = await POST(requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`));

    expect(res.status).toBe(200);
    expect(verifySession(token)).toBeNull();
    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe("");
  });

  it("is a no-op (200) when there is no session cookie", async () => {
    const { POST } = await import("./route");
    const res = await POST(requestWithCookie());
    expect(res.status).toBe(200);
  });
});
