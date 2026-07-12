import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { listAssets } from "@/lib/assets/store";
import type { Asset } from "@/lib/assets/types";
import type { InstalledPackage } from "./packageCollector";
import type { CveSeverity, NvdCveEntry } from "./nvdClient";

const CVE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function replaceInstalledPackages(
  assetId: string,
  packages: InstalledPackage[],
  now: Date = new Date(),
  db: Database = getDb(),
): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM installed_packages WHERE asset_id = ?`).run(assetId);
    const insert = db.prepare(
      `INSERT INTO installed_packages (asset_id, name, version, collected_at) VALUES (?, ?, ?, ?)`,
    );
    if (packages.length === 0) {
      // A collection can legitimately find zero packages (e.g. an unsupported
      // package manager per packageCollector.ts). Record the collection event
      // with a sentinel row so lastPackageCollectionAt/due-check logic still
      // sees a timestamp instead of treating the asset as never collected.
      insert.run(assetId, "", "", now.toISOString());
    } else {
      for (const pkg of packages) {
        insert.run(assetId, pkg.name, pkg.version, now.toISOString());
      }
    }
  });
  tx();
}

export function listInstalledPackages(assetId: string, db: Database = getDb()): InstalledPackage[] {
  return db
    .prepare(`SELECT name, version FROM installed_packages WHERE asset_id = ? AND name != ''`)
    .all(assetId) as InstalledPackage[];
}

export function lastPackageCollectionAt(assetId: string, db: Database = getDb()): string | null {
  const row = db
    .prepare(`SELECT MAX(collected_at) as latest FROM installed_packages WHERE asset_id = ?`)
    .get(assetId) as { latest: string | null };
  return row.latest;
}

export function listServerAssetsDueForCveCheck(now: Date = new Date(), db: Database = getDb()): Asset[] {
  const servers = listAssets({ type: "server" }, db);
  return servers.filter((asset) => {
    const last = lastPackageCollectionAt(asset.id, db);
    if (!last) return true;
    return now.getTime() - new Date(last).getTime() >= CVE_CHECK_INTERVAL_MS;
  });
}

export interface CveMatch {
  id: string;
  assetId: string;
  packageName: string;
  packageVersion: string;
  cveId: string;
  cvssScore: number | null;
  severity: CveSeverity;
  summary: string;
  publishedAt: string | null;
  firstSeenAt: string;
  checkedAt: string;
  dismissed: boolean;
  aiImpact: string | null;
  aiRemediation: string | null;
}

interface CveMatchRow {
  id: string;
  asset_id: string;
  package_name: string;
  package_version: string;
  cve_id: string;
  cvss_score: number | null;
  severity: CveSeverity;
  summary: string;
  published_at: string | null;
  first_seen_at: string;
  checked_at: string;
  dismissed: number;
  ai_impact: string | null;
  ai_remediation: string | null;
}

function toCveMatch(row: CveMatchRow): CveMatch {
  return {
    id: row.id,
    assetId: row.asset_id,
    packageName: row.package_name,
    packageVersion: row.package_version,
    cveId: row.cve_id,
    cvssScore: row.cvss_score,
    severity: row.severity,
    summary: row.summary,
    publishedAt: row.published_at,
    firstSeenAt: row.first_seen_at,
    checkedAt: row.checked_at,
    dismissed: row.dismissed === 1,
    aiImpact: row.ai_impact,
    aiRemediation: row.ai_remediation,
  };
}

// (asset_id, cve_id) 단위로 하나만 유지한다. 이미 있으면 checked_at/package_version만
// 갱신하고 first_seen_at은 그대로 둔다. isNew는 AI 분석 트리거 여부 판단에 쓰인다.
export function upsertCveMatch(
  input: { assetId: string; packageName: string; packageVersion: string; entry: NvdCveEntry },
  now: Date = new Date(),
  db: Database = getDb(),
): { match: CveMatch; isNew: boolean } {
  const existing = db
    .prepare(`SELECT * FROM cve_matches WHERE asset_id = ? AND cve_id = ?`)
    .get(input.assetId, input.entry.cveId) as CveMatchRow | undefined;
  const nowIso = now.toISOString();

  if (existing) {
    db.prepare(`UPDATE cve_matches SET checked_at = ?, package_version = ? WHERE id = ?`).run(
      nowIso,
      input.packageVersion,
      existing.id,
    );
    return {
      match: toCveMatch({ ...existing, checked_at: nowIso, package_version: input.packageVersion }),
      isNew: false,
    };
  }

  const row: CveMatchRow = {
    id: randomUUID(),
    asset_id: input.assetId,
    package_name: input.packageName,
    package_version: input.packageVersion,
    cve_id: input.entry.cveId,
    cvss_score: input.entry.cvssScore,
    severity: input.entry.severity,
    summary: input.entry.summary,
    published_at: input.entry.publishedAt,
    first_seen_at: nowIso,
    checked_at: nowIso,
    dismissed: 0,
    ai_impact: null,
    ai_remediation: null,
  };
  db.prepare(
    `INSERT INTO cve_matches (id, asset_id, package_name, package_version, cve_id, cvss_score, severity, summary, published_at, first_seen_at, checked_at, dismissed, ai_impact, ai_remediation)
     VALUES (@id, @asset_id, @package_name, @package_version, @cve_id, @cvss_score, @severity, @summary, @published_at, @first_seen_at, @checked_at, @dismissed, @ai_impact, @ai_remediation)`,
  ).run(row);
  return { match: toCveMatch(row), isNew: true };
}

export function setCveAiAnalysis(id: string, impact: string, remediation: string, db: Database = getDb()): void {
  db.prepare(`UPDATE cve_matches SET ai_impact = ?, ai_remediation = ? WHERE id = ?`).run(impact, remediation, id);
}

export function setCveDismissed(id: string, dismissed: boolean, db: Database = getDb()): void {
  db.prepare(`UPDATE cve_matches SET dismissed = ? WHERE id = ?`).run(dismissed ? 1 : 0, id);
}

export function listCveMatches(assetId: string, db: Database = getDb()): CveMatch[] {
  // 최신 발표(published_at) CVE가 목록 상단에 오도록 정렬한다. 발표일이 없는
  // 항목은 마지막으로, 같은 발표일 안에서는 CVSS 높은 순으로 둔다 — UI(리포트·
  // 자산 상세)가 이 순서를 그대로 렌더한다.
  const rows = db
    .prepare(
      `SELECT * FROM cve_matches WHERE asset_id = ?
       ORDER BY published_at IS NULL, published_at DESC, cvss_score DESC`,
    )
    .all(assetId) as CveMatchRow[];
  return rows.map(toCveMatch);
}
