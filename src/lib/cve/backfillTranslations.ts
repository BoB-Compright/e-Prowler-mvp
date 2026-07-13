import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { translateCveSummaries, type TranslateDeps } from "./translate";

// cve_matches의 distinct CVE 중 아직 번역 안 된 것을, 최근·CVSS 높은 순으로 limit건
// 골라 번역·캐시한다. 배포 시 컨트롤러가 상위 500건 일회성 실행(나머지는 조회 시 채움).
export async function backfillCveTranslations(
  limit = 500,
  deps?: TranslateDeps,
  db: Database = getDb(),
): Promise<number> {
  const rows = db
    .prepare(
      `SELECT cve_id, summary, MAX(cvss_score) AS score, MAX(first_seen_at) AS seen
       FROM cve_matches
       WHERE cve_id NOT IN (SELECT cve_id FROM cve_translations)
       GROUP BY cve_id
       ORDER BY score DESC, seen DESC
       LIMIT ?`,
    )
    .all(limit) as { cve_id: string; summary: string }[];
  if (rows.length === 0) return 0;

  const items = rows.map((r) => ({ cveId: r.cve_id, summary: r.summary }));
  const before = db.prepare(`SELECT COUNT(*) AS c FROM cve_translations`).get() as { c: number };
  await translateCveSummaries(items, deps, db);
  const after = db.prepare(`SELECT COUNT(*) AS c FROM cve_translations`).get() as { c: number };
  return after.c - before.c;
}
