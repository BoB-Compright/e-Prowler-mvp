import type { Database } from "better-sqlite3";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "./constants";
import { createSession } from "./session";
import { createUser } from "./users";
import { requireApiSession, requireSession } from "./requireSession";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

function requestWithCookie(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/protected", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("requireSession", () => {
  it("returns the session for a valid session cookie", () => {
    const userId = createUser("admin", "hunter2", db).id;
    const { token } = createSession(userId, db);
    const result = requireSession(requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`), db);
    expect("session" in result && result.session.userId).toBe(userId);
  });

  it("returns a 401 response when there is no session cookie", async () => {
    const result = requireSession(requestWithCookie(), db);
    expect("unauthorized" in result).toBe(true);
    if ("unauthorized" in result) {
      expect(result.unauthorized.status).toBe(401);
      const body = await result.unauthorized.json();
      expect(body.error).toBeTruthy();
    }
  });

  it("returns a 401 response for an invalid/expired session cookie", () => {
    const result = requireSession(requestWithCookie(`${SESSION_COOKIE_NAME}=not-a-real-token`), db);
    expect("unauthorized" in result).toBe(true);
    if ("unauthorized" in result) {
      expect(result.unauthorized.status).toBe(401);
    }
  });
});

describe("requireApiSession", () => {
  it("returns null (pass-through) for a valid session cookie", () => {
    const userId = createUser("admin", "hunter2", db).id;
    const { token } = createSession(userId, db);
    const req = new Request("http://localhost/api/protected", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(requireApiSession(req, db)).toBeNull();
  });

  it("returns a 401 response when there is no cookie at all", async () => {
    const res = requireApiSession(new Request("http://localhost/api/protected"), db);
    expect(res?.status).toBe(401);
    const body = await res?.json();
    expect(body.error).toBeTruthy();
  });

  it("returns a 401 response for a forged/garbage session cookie", () => {
    const req = new Request("http://localhost/api/protected", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=garbage` },
    });
    expect(requireApiSession(req, db)?.status).toBe(401);
  });

  it("returns a 401 response for an expired session", () => {
    const userId = createUser("admin", "hunter2", db).id;
    const { token } = createSession(userId, db);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      userId,
    );
    const req = new Request("http://localhost/api/protected", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(requireApiSession(req, db)?.status).toBe(401);
  });

  it("finds the session cookie among multiple cookies in the header", () => {
    const userId = createUser("admin", "hunter2", db).id;
    const { token } = createSession(userId, db);
    const req = new Request("http://localhost/api/protected", {
      headers: { cookie: `theme=dark; ${SESSION_COOKIE_NAME}=${token}; other=1` },
    });
    expect(requireApiSession(req, db)).toBeNull();
  });
});
