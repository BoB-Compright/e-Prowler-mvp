import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { CveSeverity } from "./nvdClient";

export const FEED_RETENTION_DAYS = 14;

export interface FeedCveInput {
  cveId: string;
  publishedAt: string | null;
  severity: CveSeverity;
  cvssScore: number | null;
  summary: string;
}

// cve_id 단위 upsert. 재수집 시 collected_at만 now로 갱신(최근 유입 정렬 반영),
// first_collected_at은 최초값 유지. 나머지 필드는 최신값으로 갱신.
export function upsertFeedCve(entry: FeedCveInput, now: Date = new Date(), db: Database = getDb()): void {
  const nowIso = now.toISOString();
  db.prepare(
    `INSERT INTO feed_cves (cve_id, published_at, severity, cvss_score, summary, first_collected_at, collected_at)
     VALUES (@cveId, @publishedAt, @severity, @cvssScore, @summary, @nowIso, @nowIso)
     ON CONFLICT(cve_id) DO UPDATE SET
       published_at = @publishedAt, severity = @severity, cvss_score = @cvssScore,
       summary = @summary, collected_at = @nowIso`,
  ).run({
    cveId: entry.cveId,
    publishedAt: entry.publishedAt,
    severity: entry.severity,
    cvssScore: entry.cvssScore,
    summary: entry.summary,
    nowIso,
  });
}

// 14일보다 오래 전 수집(collected_at)된 행 삭제. cve_matches는 건드리지 않는다.
export function pruneFeedCves(now: Date = new Date(), db: Database = getDb()): number {
  const cutoff = new Date(now.getTime() - FEED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const info = db.prepare(`DELETE FROM feed_cves WHERE collected_at < ?`).run(cutoff);
  return info.changes;
}

export function relativeLabel(fromIso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(fromIso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function actionRequired(assetMatches: number): boolean {
  return assetMatches > 0;
}

export interface FeedRow {
  cveId: string;
  publishedAt: string | null;
  severity: CveSeverity;
  cvssScore: number | null;
  summary: string;
  collectedAt: string;
  collectedLabel: string;
  assetMatches: number;
}

// feed_cves 전체를 collected_at DESC로, 각 cve_id의 자산 매칭 수(distinct asset_id,
// dismissed 제외)를 붙여 반환한다.
export function listFeedForDisplay(now: Date = new Date(), db: Database = getDb()): FeedRow[] {
  const rows = db
    .prepare(
      `SELECT f.cve_id, f.published_at, f.severity, f.cvss_score, f.summary, f.collected_at,
        (SELECT COUNT(DISTINCT m.asset_id) FROM cve_matches m
          WHERE m.cve_id = f.cve_id AND m.dismissed = 0) AS asset_matches
       FROM feed_cves f
       ORDER BY f.collected_at DESC`,
    )
    .all() as {
    cve_id: string;
    published_at: string | null;
    severity: CveSeverity;
    cvss_score: number | null;
    summary: string;
    collected_at: string;
    asset_matches: number;
  }[];
  return rows.map((r) => ({
    cveId: r.cve_id,
    publishedAt: r.published_at,
    severity: r.severity,
    cvssScore: r.cvss_score,
    summary: r.summary,
    collectedAt: r.collected_at,
    collectedLabel: relativeLabel(r.collected_at, now),
    assetMatches: r.asset_matches,
  }));
}
