import type { Database } from "better-sqlite3";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { DuplicateAssetError, createRepoAsset, createServerAsset } from "./store";
import type { ServerAuthType } from "./types";

export type ImportRowResult =
  | { row: number; ok: true; assetId: string }
  | { row: number; ok: false; reason: string };

interface RepoRow { display_name?: unknown; repo_url?: unknown; os?: unknown; owner?: unknown }
interface ServerRow {
  display_name?: unknown; host_ip?: unknown; hostname?: unknown; ssh_port?: unknown;
  auth_type?: unknown; username?: unknown; secret?: unknown; os?: unknown; owner?: unknown;
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function importRepoSheet(rows: RepoRow[], projectId: string | null, db: Database): ImportRowResult[] {
  return rows.map((raw, index) => {
    const rowNumber = index + 2; // 헤더가 1행이므로 데이터는 2행부터
    const displayName = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
    const repoUrl = typeof raw.repo_url === "string" ? raw.repo_url.trim() : "";
    if (!displayName || !repoUrl) {
      return { row: rowNumber, ok: false, reason: "display_name과 repo_url은 필수입니다" };
    }
    const os = optionalTrimmedString(raw.os);
    const owner = optionalTrimmedString(raw.owner);
    try {
      const asset = createRepoAsset({ displayName, repoUrl, projectId, os, owner }, db);
      return { row: rowNumber, ok: true, assetId: asset.id };
    } catch (error) {
      if (error instanceof DuplicateAssetError) return { row: rowNumber, ok: false, reason: error.message };
      throw error;
    }
  });
}

const VALID_AUTH_TYPES: ServerAuthType[] = ["password", "key"];

function importServerSheet(rows: ServerRow[], projectId: string | null, db: Database): ImportRowResult[] {
  return rows.map((raw, index) => {
    const rowNumber = index + 2;
    const displayName = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
    const hostIp = typeof raw.host_ip === "string" ? raw.host_ip.trim() : "";
    const hostname = typeof raw.hostname === "string" ? raw.hostname.trim() : "";
    const sshPort = Number(raw.ssh_port);
    const authType = raw.auth_type as ServerAuthType;
    const username = typeof raw.username === "string" ? raw.username.trim() : "";
    const secret =
      typeof raw.secret === "string"
        ? raw.secret
        : typeof raw.secret === "number"
          ? String(raw.secret)
          : "";

    if (!displayName || !hostIp || !hostname || !username || !secret) {
      return { row: rowNumber, ok: false, reason: "필수 컬럼이 비어 있습니다" };
    }
    if (!Number.isInteger(sshPort) || sshPort <= 0) {
      return { row: rowNumber, ok: false, reason: "ssh_port가 올바르지 않습니다" };
    }
    if (!VALID_AUTH_TYPES.includes(authType)) {
      return { row: rowNumber, ok: false, reason: "auth_type은 password 또는 key여야 합니다" };
    }

    const os = optionalTrimmedString(raw.os);
    const owner = optionalTrimmedString(raw.owner);
    try {
      const asset = createServerAsset({ displayName, hostIp, hostname, sshPort, authType, username, secret, projectId, os, owner }, db);
      return { row: rowNumber, ok: true, assetId: asset.id };
    } catch (error) {
      if (error instanceof DuplicateAssetError) return { row: rowNumber, ok: false, reason: error.message };
      throw error;
    }
  });
}

export function importAssetsFromWorkbook(
  buffer: Buffer,
  projectId: string | null,
  db: Database = getDb(),
): { repo: ImportRowResult[]; server: ImportRowResult[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const repoSheet = workbook.Sheets["repo"];
  const serverSheet = workbook.Sheets["server"];
  return {
    repo: repoSheet
      ? importRepoSheet(XLSX.utils.sheet_to_json<RepoRow>(repoSheet, { blankrows: true }), projectId, db)
      : [],
    server: serverSheet
      ? importServerSheet(XLSX.utils.sheet_to_json<ServerRow>(serverSheet, { blankrows: true }), projectId, db)
      : [],
  };
}
