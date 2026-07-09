import type { Database } from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { SESSION_TTL_MS } from "./constants";

export interface Session {
  userId: string;
  username: string;
  expiresAt: string;
}

interface SessionRow {
  expires_at: string;
  user_id: string;
  username: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Creates a session for userId and returns the *raw* token — this is the only
// place the raw value exists; only its hash is persisted (see
// docs/adr/0001-authentication-local-accounts.md, section 2).
export function createSession(userId: string, db: Database = getDb()): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, hashToken(token), createdAt.toISOString(), expiresAt.toISOString());
  return { token, expiresAt: expiresAt.toISOString() };
}

// Returns the session (with the owning user's username) for a valid,
// unexpired token, or null otherwise. Expired sessions are deleted as a side
// effect so the table doesn't grow without bound.
export function verifySession(token: string | undefined | null, db: Database = getDb()): Session | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.expires_at as expires_at, u.id as user_id, u.username as username
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
    return null;
  }
  return { userId: row.user_id, username: row.username, expiresAt: row.expires_at };
}

// Logout: deletes the session row so the token can never be reused. A
// missing/unknown token is a no-op, not an error.
export function invalidateSession(token: string | undefined | null, db: Database = getDb()): void {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
}
