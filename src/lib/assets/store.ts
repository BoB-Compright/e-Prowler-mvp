import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { normalizeRepoUrl } from "@/lib/pipeline/repoUrl";
import { encryptSecret } from "@/lib/crypto/secretCipher";
import type { Asset, AssetType, ServerAuthType } from "./types";

export class DuplicateAssetError extends Error {}
export class AssetInUseError extends Error {}

interface AssetRow {
  id: string;
  type: AssetType;
  project_id: string | null;
  display_name: string;
  repo_url: string | null;
  host_ip: string | null;
  hostname: string | null;
  ssh_port: number | null;
  auth_type: ServerAuthType | null;
  username: string | null;
  encrypted_secret: string | null;
  os: string | null;
  owner: string | null;
  category: string | null;
  vendor: string | null;
  dockerfile_path: string | null;
  created_at: string;
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    type: row.type,
    projectId: row.project_id,
    displayName: row.display_name,
    repoUrl: row.repo_url,
    hostIp: row.host_ip,
    hostname: row.hostname,
    sshPort: row.ssh_port,
    authType: row.auth_type,
    username: row.username,
    encryptedSecret: row.encrypted_secret,
    os: row.os,
    owner: row.owner,
    category: row.category,
    vendor: row.vendor,
    dockerfilePath: row.dockerfile_path,
    createdAt: row.created_at,
  };
}

const INSERT_SQL = `INSERT INTO assets (id, type, project_id, display_name, repo_url, host_ip, hostname, ssh_port, auth_type, username, encrypted_secret, os, owner, category, vendor, dockerfile_path, created_at)
     VALUES (@id, @type, @project_id, @display_name, @repo_url, @host_ip, @hostname, @ssh_port, @auth_type, @username, @encrypted_secret, @os, @owner, @category, @vendor, @dockerfile_path, @created_at)`;

export function createRepoAsset(
  input: {
    displayName: string; repoUrl: string; projectId?: string | null;
    os?: string | null; owner?: string | null; dockerfilePath?: string | null;
  },
  db: Database = getDb(),
): Asset {
  const normalized = normalizeRepoUrl(input.repoUrl);
  const dfPath = input.dockerfilePath ?? null;
  const existing = db
    .prepare(`SELECT * FROM assets WHERE type = 'repo' AND repo_url = ? AND dockerfile_path IS ?`)
    .get(normalized, dfPath) as AssetRow | undefined;
  if (existing) {
    throw new DuplicateAssetError(`이미 등록된 레포입니다: ${normalized}${dfPath ? ` (${dfPath})` : ""}`);
  }

  const row: AssetRow = {
    id: randomUUID(),
    type: "repo",
    project_id: input.projectId ?? null,
    display_name: input.displayName,
    repo_url: normalized,
    host_ip: null, hostname: null, ssh_port: null, auth_type: null, username: null, encrypted_secret: null,
    os: input.os ?? null,
    owner: input.owner ?? null,
    category: null,
    vendor: null,
    dockerfile_path: dfPath,
    created_at: new Date().toISOString(),
  };
  db.prepare(INSERT_SQL).run(row);
  return toAsset(row);
}

export function createServerAsset(
  input: {
    displayName: string; hostIp: string; hostname: string; sshPort: number;
    authType: ServerAuthType; username: string; secret: string; projectId?: string | null;
    os?: string | null; owner?: string | null; category?: string | null; vendor?: string | null;
  },
  db: Database = getDb(),
): Asset {
  const existing = db
    .prepare(`SELECT * FROM assets WHERE type = 'server' AND host_ip = ? AND ssh_port = ?`)
    .get(input.hostIp, input.sshPort) as AssetRow | undefined;
  if (existing) {
    throw new DuplicateAssetError(`이미 등록된 서버입니다: ${input.hostIp}:${input.sshPort}`);
  }

  const row: AssetRow = {
    id: randomUUID(),
    type: "server",
    project_id: input.projectId ?? null,
    display_name: input.displayName,
    repo_url: null,
    host_ip: input.hostIp,
    hostname: input.hostname,
    ssh_port: input.sshPort,
    auth_type: input.authType,
    username: input.username,
    encrypted_secret: encryptSecret(input.secret),
    os: input.os ?? null,
    owner: input.owner ?? null,
    category: input.category ?? null,
    vendor: input.vendor ?? null,
    dockerfile_path: null,
    created_at: new Date().toISOString(),
  };
  db.prepare(INSERT_SQL).run(row);
  return toAsset(row);
}

export function listAssets(
  filter: { projectId?: string | null; type?: AssetType } = {},
  db: Database = getDb(),
): Asset[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.projectId !== undefined) {
    if (filter.projectId === null) {
      conditions.push("project_id IS NULL");
    } else {
      conditions.push("project_id = @projectId");
      params.projectId = filter.projectId;
    }
  }
  if (filter.type) {
    conditions.push("type = @type");
    params.type = filter.type;
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM assets ${where} ORDER BY created_at DESC`).all(params) as AssetRow[];
  return rows.map(toAsset);
}

export function listRepoAssetsByRepoUrl(repoUrl: string, db: Database = getDb()): Asset[] {
  const normalized = normalizeRepoUrl(repoUrl);
  const rows = db
    .prepare(`SELECT * FROM assets WHERE type = 'repo' AND repo_url = ?`)
    .all(normalized) as AssetRow[];
  return rows.map(toAsset);
}

export function getAsset(id: string, db: Database = getDb()): Asset | undefined {
  const row = db.prepare(`SELECT * FROM assets WHERE id = ?`).get(id) as AssetRow | undefined;
  return row ? toAsset(row) : undefined;
}

export function setAssetsProject(
  assetIds: string[],
  projectId: string | null,
  db: Database = getDb(),
): number {
  if (assetIds.length === 0) return 0;
  const placeholders = assetIds.map(() => "?").join(",");
  const result = db
    .prepare(`UPDATE assets SET project_id = ? WHERE id IN (${placeholders})`)
    .run(projectId, ...assetIds);
  return result.changes;
}

export function deleteAsset(id: string, db: Database = getDb()): void {
  const runningRun = db
    .prepare(`SELECT id FROM runs WHERE asset_id = ? AND status = 'running'`)
    .get(id);
  if (runningRun) {
    throw new AssetInUseError("실행 중인 점검이 있어 삭제할 수 없습니다");
  }
  const deleteTransaction = db.transaction(() => {
    db.prepare(`DELETE FROM cve_matches WHERE asset_id = ?`).run(id);
    db.prepare(`DELETE FROM installed_packages WHERE asset_id = ?`).run(id);
    db.prepare(`DELETE FROM schedules WHERE asset_id = ?`).run(id);
    const runIds = (
      db.prepare(`SELECT id FROM runs WHERE asset_id = ?`).all(id) as { id: string }[]
    ).map((row) => row.id);
    for (const runId of runIds) {
      db.prepare(`DELETE FROM run_events WHERE run_id = ?`).run(runId);
      db.prepare(`DELETE FROM check_results WHERE run_id = ?`).run(runId);
      db.prepare(`DELETE FROM analysis_reports WHERE run_id = ?`).run(runId);
    }
    db.prepare(`DELETE FROM runs WHERE asset_id = ?`).run(id);
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(id);
  });
  deleteTransaction();
}
