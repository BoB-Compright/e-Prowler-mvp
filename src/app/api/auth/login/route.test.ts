import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
});

function jsonRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/auth/login", () => {
  it("rejects missing username/password with 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown username with 401", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ username: "nobody", password: "whatever" }));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password with 401", async () => {
    const { createUser } = await import("@/lib/auth/users");
    createUser("admin", "hunter2");
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ username: "admin", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("logs in successfully and sets an httpOnly session cookie", async () => {
    const { createUser } = await import("@/lib/auth/users");
    createUser("admin", "hunter2");
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ username: "admin", password: "hunter2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("admin");

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(String(cookie?.sameSite).toLowerCase()).toBe("lax");
  });
});
