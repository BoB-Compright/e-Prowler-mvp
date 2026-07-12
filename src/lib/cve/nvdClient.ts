import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { createRateLimiter } from "./rateLimiter";
import { isVersionInRange, type VersionRange } from "./versionRange";

const NVD_BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type CveSeverity = "critical" | "high" | "medium" | "low" | "unknown";

export interface NvdCveEntry {
  cveId: string;
  cvssScore: number | null;
  severity: CveSeverity;
  summary: string;
  publishedAt: string | null;
  versionRange: VersionRange;
}

export interface NvdClientDeps {
  fetch: typeof fetch;
  wait: () => Promise<void>;
}

const sharedRateLimiter = createRateLimiter();
const defaultDeps: NvdClientDeps = { fetch, wait: sharedRateLimiter };

export function severityFromScore(score: number | null): CveSeverity {
  if (score === null) return "unknown";
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  return "low";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNvdResponse(json: any): NvdCveEntry[] {
  const vulnerabilities = json.vulnerabilities ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vulnerabilities.map((v: any): NvdCveEntry => {
    const cve = v.cve;
    const metric =
      cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV30?.[0] ?? cve.metrics?.cvssMetricV2?.[0];
    const cvssScore = metric?.cvssData?.baseScore ?? null;
    const cpeMatch = cve.configurations?.[0]?.nodes?.[0]?.cpeMatch?.[0] ?? {};
    return {
      cveId: cve.id,
      cvssScore,
      severity: severityFromScore(cvssScore),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summary: cve.descriptions?.find((d: any) => d.lang === "en")?.value ?? "",
      publishedAt: cve.published ?? null,
      versionRange: {
        versionStartIncluding: cpeMatch.versionStartIncluding,
        versionStartExcluding: cpeMatch.versionStartExcluding,
        versionEndIncluding: cpeMatch.versionEndIncluding,
        versionEndExcluding: cpeMatch.versionEndExcluding,
      },
    };
  });
}

function readCache(packageName: string, db: Database): { entries: NvdCveEntry[]; fresh: boolean } | null {
  const row = db
    .prepare(`SELECT raw_response, fetched_at FROM nvd_query_cache WHERE package_name = ?`)
    .get(packageName) as { raw_response: string; fetched_at: string } | undefined;
  if (!row) return null;
  let entries: NvdCveEntry[];
  try {
    entries = JSON.parse(row.raw_response) as NvdCveEntry[];
  } catch {
    return null;
  }
  const fresh = Date.now() - new Date(row.fetched_at).getTime() <= CACHE_TTL_MS;
  return { entries, fresh };
}

function writeCache(packageName: string, entries: NvdCveEntry[], db: Database): void {
  db.prepare(
    `INSERT INTO nvd_query_cache (package_name, raw_response, fetched_at) VALUES (@packageName, @rawResponse, @fetchedAt)
     ON CONFLICT(package_name) DO UPDATE SET raw_response = @rawResponse, fetched_at = @fetchedAt`,
  ).run({ packageName, rawResponse: JSON.stringify(entries), fetchedAt: new Date().toISOString() });
}

// 캐시가 신선하면 그대로 쓰고, 없거나 만료됐으면 NVD를 호출한다(레이트리밋 대기 포함).
// 호출이 실패하면 만료된 캐시라도 있으면 폴백으로 쓴다.
export async function queryPackageCves(
  packageName: string,
  installedVersion: string,
  deps: NvdClientDeps = defaultDeps,
  db: Database = getDb(),
): Promise<NvdCveEntry[]> {
  const cached = readCache(packageName, db);
  if (cached?.fresh) {
    return cached.entries.filter((entry) => isVersionInRange(installedVersion, entry.versionRange));
  }

  let entries: NvdCveEntry[];
  try {
    await deps.wait();
    const res = await deps.fetch(`${NVD_BASE_URL}?keywordSearch=${encodeURIComponent(packageName)}`);
    if (!res.ok) throw new Error(`NVD 응답 실패: ${res.status}`);
    const json = await res.json();
    entries = parseNvdResponse(json);
    writeCache(packageName, entries, db);
  } catch {
    entries = cached?.entries ?? [];
  }

  return entries.filter((entry) => isVersionInRange(installedVersion, entry.versionRange));
}
