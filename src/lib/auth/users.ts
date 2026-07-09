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
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return toUser(row);
}
