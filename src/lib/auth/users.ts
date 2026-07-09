import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

function toUser(row: UserRow): User {
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function createUser(username: string, password: string, db: Database = getDb()): User {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
  ).run(id, username, hashPassword(password), createdAt);
  return { id, username, createdAt };
}

export function getUserByUsername(username: string, db: Database = getDb()): User | undefined {
  const row = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username) as
    | UserRow
    | undefined;
  return row ? toUser(row) : undefined;
}

export function countUsers(db: Database = getDb()): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number };
  return row.count;
}

// Fixed decoy hash (computed once at module load) verified against when the
// username doesn't exist, so both failure paths pay the same scrypt cost —
// otherwise the fast unknown-username return would let an attacker enumerate
// valid usernames by timing the login endpoint.
const DECOY_HASH = hashPassword("decoy-password-for-timing-equalization");

// Returns the user on success, or null for an unknown username / wrong
// password. Deliberately doesn't distinguish the two in its return value —
// callers must not leak which one failed.
export function verifyCredentials(
  username: string,
  password: string,
  db: Database = getDb(),
): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username) as
    | UserRow
    | undefined;
  if (!row) {
    // Burn the same scrypt work as the known-username path. This can never
    // verify: the decoy hash was derived from a fixed literal with a random
    // salt, not from the submitted password.
    verifyPassword(password, DECOY_HASH);
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) return null;
  return toUser(row);
}
