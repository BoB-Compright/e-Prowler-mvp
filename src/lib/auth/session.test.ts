import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createUser } from "./users";
import { createSession, invalidateSession, verifySession } from "./session";

let db: Database;
let userId: string;

beforeEach(() => {
  db = createInMemoryDb();
  userId = createUser("admin", "hunter2", db).id;
});

describe("createSession", () => {
  it("returns a token and an expiry ~7 days out", () => {
    const before = Date.now();
    const session = createSession(userId, db);
    expect(session.token).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex-encoded
    const expiresAt = new Date(session.expiresAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDaysMs - 5000);
    expect(expiresAt).toBeLessThanOrEqual(before + sevenDaysMs + 5000);
  });

  it("does not store the raw token in the sessions table", () => {
    const session = createSession(userId, db);
    const row = db.prepare("SELECT token_hash FROM sessions WHERE user_id = ?").get(userId) as {
      token_hash: string;
    };
    expect(row.token_hash).not.toBe(session.token);
  });
});

describe("verifySession", () => {
  it("returns the session's user for a valid token", () => {
    const { token } = createSession(userId, db);
    const session = verifySession(token, db);
    expect(session?.userId).toBe(userId);
    expect(session?.username).toBe("admin");
  });

  it("returns null for an unknown token", () => {
    expect(verifySession("not-a-real-token", db)).toBeNull();
  });

  it("returns null for a missing/undefined token", () => {
    expect(verifySession(undefined, db)).toBeNull();
    expect(verifySession("", db)).toBeNull();
  });

  it("returns null for an expired session", () => {
    const { token } = createSession(userId, db);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      userId,
    );
    expect(verifySession(token, db)).toBeNull();
  });
});

describe("invalidateSession", () => {
  it("makes the token unusable after logout", () => {
    const { token } = createSession(userId, db);
    invalidateSession(token, db);
    expect(verifySession(token, db)).toBeNull();
  });

  it("does not throw for a missing/undefined token", () => {
    expect(() => invalidateSession(undefined, db)).not.toThrow();
    expect(() => invalidateSession("nonexistent", db)).not.toThrow();
  });
});
