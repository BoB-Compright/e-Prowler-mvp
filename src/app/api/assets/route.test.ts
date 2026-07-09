import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// route.ts (and the lib modules it calls) reach the shared getDb() singleton,
// which is created lazily from process.env.DATABASE_PATH. Resetting the
// module registry + pointing DATABASE_PATH at ":memory:" before each test
// gives every test its own isolated in-memory database.
beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

// The handlers only touch req.json() and req.headers, so a plain Request is a
// sufficient runtime stand-in for NextRequest.
function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// Creates a real user + session in the same in-memory DB the route handler
// uses (same module registry — everything is imported after resetModules),
// and returns the Cookie header value for authenticated requests.
async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("tester", "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/assets — session guard", () => {
  it("returns 401 without any session cookie", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ type: "repo", displayName: "x", repoUrl: "https://github.com/x/x" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a forged session cookie", async () => {
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
    const { POST } = await import("./route");
    const res = await POST(
      jsonRequest(
        { type: "repo", displayName: "x", repoUrl: "https://github.com/x/x" },
        `${SESSION_COOKIE_NAME}=garbage`,
      ),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/assets", () => {
  it("normalizes whitespace-only os to null for repo assets", async () => {
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(jsonRequest({
      type: "repo",
      displayName: "test",
      repoUrl: "https://github.com/x/test",
      os: "   ",
    }, cookie));

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ os: null });
  });

  it("normalizes numeric os in the JSON body to null for repo assets (no 500)", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(jsonRequest({
      type: "repo",
      displayName: "test",
      repoUrl: "https://github.com/x/test",
      os: 12345,
    }, cookie));

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = body.asset;
    expect(asset).toMatchObject({ os: null });
  });

  it("normalizes whitespace-only owner to null for repo assets", async () => {
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(jsonRequest({
      type: "repo",
      displayName: "test",
      repoUrl: "https://github.com/x/test",
      owner: "   ",
    }, cookie));

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ owner: null });
  });

  it("normalizes whitespace-only os to null for server assets", async () => {
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(jsonRequest({
      type: "server",
      displayName: "web-01",
      hostIp: "10.0.0.5",
      hostname: "web-01",
      sshPort: 22,
      authType: "password",
      username: "admin",
      secret: "pw",
      os: "   ",
    }, cookie));

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ os: null });
  });

  it("normalizes numeric os in the JSON body to null for server assets (no 500)", async () => {
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(jsonRequest({
      type: "server",
      displayName: "web-01",
      hostIp: "10.0.0.5",
      hostname: "web-01",
      sshPort: 22,
      authType: "password",
      username: "admin",
      secret: "pw",
      os: 12345,
    }, cookie));

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ os: null });
  });
});
