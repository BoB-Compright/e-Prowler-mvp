import type { Database } from "better-sqlite3";
import { randomBytes, randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { hashSharePassword, verifySharePassword } from "@/lib/crypto/sharePassword";
import type { Project } from "./types";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export class ProjectNotFoundError extends Error {}

interface ProjectRow {
  id: string;
  name: string;
  pm_name: string;
  pm_email: string;
  share_token: string;
  share_password_hash: string;
  share_failed_attempts: number;
  share_locked_until: string | null;
  created_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    pmName: row.pm_name,
    pmEmail: row.pm_email,
    shareToken: row.share_token,
    createdAt: row.created_at,
  };
}

export function createProject(
  input: { name: string; pmName: string; pmEmail: string; sharePassword: string },
  db: Database = getDb(),
): Project {
  const row: ProjectRow = {
    id: randomUUID(),
    name: input.name,
    pm_name: input.pmName,
    pm_email: input.pmEmail,
    share_token: randomBytes(24).toString("base64url"),
    share_password_hash: hashSharePassword(input.sharePassword),
    share_failed_attempts: 0,
    share_locked_until: null,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO projects (id, name, pm_name, pm_email, share_token, share_password_hash, share_failed_attempts, share_locked_until, created_at)
     VALUES (@id, @name, @pm_name, @pm_email, @share_token, @share_password_hash, @share_failed_attempts, @share_locked_until, @created_at)`,
  ).run(row);
  return toProject(row);
}

export function listProjects(db: Database = getDb()): Project[] {
  const rows = db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: string, db: Database = getDb()): Project | undefined {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  return row ? toProject(row) : undefined;
}

export function updateProject(
  id: string,
  input: { name?: string; pmName?: string; pmEmail?: string },
  db: Database = getDb(),
): Project {
  const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  if (!existing) {
    throw new ProjectNotFoundError(`프로젝트를 찾을 수 없습니다: ${id}`);
  }
  const updated: ProjectRow = {
    ...existing,
    name: input.name ?? existing.name,
    pm_name: input.pmName ?? existing.pm_name,
    pm_email: input.pmEmail ?? existing.pm_email,
  };
  db.prepare(`UPDATE projects SET name = @name, pm_name = @pm_name, pm_email = @pm_email WHERE id = @id`).run(updated);
  return toProject(updated);
}

export function deleteProject(id: string, db: Database = getDb()): void {
  const transaction = db.transaction(() => {
    db.prepare(`UPDATE assets SET project_id = NULL WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  transaction();
}

export function regenerateShareLink(
  id: string,
  newPassword: string,
  db: Database = getDb(),
): { shareToken: string } {
  const shareToken = randomBytes(24).toString("base64url");
  const result = db.prepare(
    `UPDATE projects SET share_token = ?, share_password_hash = ?, share_failed_attempts = 0, share_locked_until = NULL WHERE id = ?`,
  ).run(shareToken, hashSharePassword(newPassword), id);
  if (result.changes === 0) {
    throw new ProjectNotFoundError(`프로젝트를 찾을 수 없습니다: ${id}`);
  }
  return { shareToken };
}

export function verifyShareAccess(
  token: string,
  password: string,
  db: Database = getDb(),
): { ok: true; project: Project } | { ok: false; reason: "not_found" | "locked" | "wrong_password" } {
  const row = db.prepare(`SELECT * FROM projects WHERE share_token = ?`).get(token) as ProjectRow | undefined;
  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  if (row.share_locked_until && new Date(row.share_locked_until) > new Date()) {
    return { ok: false, reason: "locked" };
  }

  if (row.share_locked_until) {
    // The lock existed but has since expired — give the caller a fresh
    // attempt budget instead of carrying the stale count forward.
    row.share_failed_attempts = 0;
    db.prepare(`UPDATE projects SET share_failed_attempts = 0, share_locked_until = NULL WHERE id = ?`).run(row.id);
  }

  if (!verifySharePassword(password, row.share_password_hash)) {
    const attempts = row.share_failed_attempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : null;
    db.prepare(`UPDATE projects SET share_failed_attempts = ?, share_locked_until = ? WHERE id = ?`).run(attempts, lockedUntil, row.id);
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "locked" : "wrong_password" };
  }

  db.prepare(`UPDATE projects SET share_failed_attempts = 0, share_locked_until = NULL WHERE id = ?`).run(row.id);
  return { ok: true, project: toProject(row) };
}
