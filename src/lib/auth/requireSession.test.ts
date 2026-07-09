import type { Database } from "better-sqlite3";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "./constants";
import { createSession } from "./session";
import { createUser } from "./users";
import { requireSession } from "./requireSession";

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
