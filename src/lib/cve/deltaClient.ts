import { createRateLimiter } from "./rateLimiter";
import { severityFromScore, type CveSeverity } from "./nvdClient";
import type { VersionRange } from "./versionRange";

const NVD_BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const RESULTS_PER_PAGE = 2000;

// nvdClient의 NvdCveEntry와 같은 모양에 product를 더한 것 — 델타 역매칭은
// "이 CVE가 어떤 제품에 대한 것인지"를 알아야 인벤토리와 대조할 수 있다.
// upsertCveMatch는 NvdCveEntry 형태를 받으므로 이 타입을 그대로 넘길 수 있다.
export interface DeltaCveEntry {
  cveId: string;
  cvssScore: number | null;
  severity: CveSeverity;
  summary: string;
  publishedAt: string | null;
  product: string;
  versionRange: VersionRange;
}

export interface DeltaClientDeps {
  fetch: typeof fetch;
  wait: () => Promise<void>;
  env?: Record<string, string | undefined>;
}

const sharedRateLimiter = createRateLimiter();
const defaultDeps: DeltaClientDeps = { fetch, wait: sharedRateLimiter };

// cpe:2.3:<part>:<vendor>:<product>:<version>:... 에서 product(인덱스 4)와
// version(인덱스 5)을 뽑는다. 형식이 아니면 null.
function parseCpe(criteria: string): { product: string; version: string } | null {
  const parts = criteria.split(":");
  if (parts.length < 6 || parts[0] !== "cpe") return null;
  return { product: parts[4], version: parts[5] };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseDeltaResponse(json: any): DeltaCveEntry[] {
  const entries: DeltaCveEntry[] = [];
  for (const v of json.vulnerabilities ?? []) {
    const cve = v.cve;
    const metric =
      cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV30?.[0] ?? cve.metrics?.cvssMetricV2?.[0];
    const cvssScore = metric?.cvssData?.baseScore ?? null;
    const base = {
      cveId: cve.id as string,
      cvssScore,
      severity: severityFromScore(cvssScore),
      summary: (cve.descriptions?.find((d: any) => d.lang === "en")?.value ?? "") as string,
      publishedAt: (cve.published ?? null) as string | null,
    };
    for (const config of cve.configurations ?? []) {
      for (const node of config.nodes ?? []) {
        for (const cpeMatch of node.cpeMatch ?? []) {
          if (cpeMatch.vulnerable === false) continue;
          const cpe = parseCpe(cpeMatch.criteria ?? "");
          if (!cpe) continue;
          const hasRangeFields =
            cpeMatch.versionStartIncluding !== undefined ||
            cpeMatch.versionStartExcluding !== undefined ||
            cpeMatch.versionEndIncluding !== undefined ||
            cpeMatch.versionEndExcluding !== undefined;
          // 범위 필드가 없으면 cpe의 version 필드를 exact 매치로 쓴다("*"/"-"는 전체 버전).
          const versionRange: VersionRange = hasRangeFields
            ? {
                versionStartIncluding: cpeMatch.versionStartIncluding,
                versionStartExcluding: cpeMatch.versionStartExcluding,
                versionEndIncluding: cpeMatch.versionEndIncluding,
                versionEndExcluding: cpeMatch.versionEndExcluding,
              }
            : cpe.version !== "*" && cpe.version !== "-"
              ? { versionStartIncluding: cpe.version, versionEndIncluding: cpe.version }
              : {};
          entries.push({ ...base, product: cpe.product, versionRange });
        }
      }
    }
  }
  return entries;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// [windowStart, windowEnd] 사이에 수정/발표된 CVE를 전부 페이지 순회로 가져온다.
// 델타는 매번 새 윈도우라 nvd_query_cache는 쓰지 않는다. 실패는 그대로 throw —
// 워처(runDeltaCycle)가 워터마크를 전진시키지 않는 것으로 재시도를 보장한다.
export async function fetchRecentCves(
  windowStart: Date,
  windowEnd: Date,
  deps: DeltaClientDeps = defaultDeps,
): Promise<DeltaCveEntry[]> {
  const apiKey = (deps.env ?? process.env).NVD_API_KEY;
  const headers: Record<string, string> = apiKey ? { apiKey } : {};
  const entries: DeltaCveEntry[] = [];
  let startIndex = 0;
  for (;;) {
    await deps.wait();
    const url =
      `${NVD_BASE_URL}?lastModStartDate=${encodeURIComponent(windowStart.toISOString())}` +
      `&lastModEndDate=${encodeURIComponent(windowEnd.toISOString())}` +
      `&resultsPerPage=${RESULTS_PER_PAGE}&startIndex=${startIndex}`;
    const res = await deps.fetch(url, { headers });
    if (!res.ok) throw new Error(`NVD 델타 응답 실패: ${res.status}`);
    const json = await res.json();
    entries.push(...parseDeltaResponse(json));
    startIndex += RESULTS_PER_PAGE;
    if (startIndex >= (json.totalResults ?? 0)) break;
  }
  return entries;
}
