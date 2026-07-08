import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { queryPackageCves, type NvdClientDeps } from "./nvdClient";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

function nvdResponse(cveId: string, versionEndExcluding?: string) {
  return {
    vulnerabilities: [
      {
        cve: {
          id: cveId,
          published: "2026-01-01T00:00:00.000",
          descriptions: [{ lang: "en", value: "example vulnerability" }],
          metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.1 } }] },
          configurations: versionEndExcluding
            ? [{ nodes: [{ cpeMatch: [{ versionEndExcluding }] }] }]
            : [],
        },
      },
    ],
  };
}

describe("queryPackageCves", () => {
  it("fetches from NVD, filters by version, and caches the raw response", async () => {
    const deps: NvdClientDeps = {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => nvdResponse("CVE-2024-0001", "1.1.2"),
      }),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const entries = await queryPackageCves("openssl", "1.1.1f-1ubuntu2.16", deps, db);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ cveId: "CVE-2024-0001", cvssScore: 9.1, severity: "critical" });
    expect(deps.wait).toHaveBeenCalledTimes(1);

    const cached = db.prepare(`SELECT package_name FROM nvd_query_cache WHERE package_name = ?`).get("openssl");
    expect(cached).toBeTruthy();
  });

  it("excludes entries whose version range does not include the installed version", async () => {
    const deps: NvdClientDeps = {
      fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => nvdResponse("CVE-2024-0002", "1.0.0") }),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const entries = await queryPackageCves("openssl", "1.1.1f", deps, db);

    expect(entries).toEqual([]);
  });

  it("reuses the cache within TTL without calling fetch again", async () => {
    const deps: NvdClientDeps = {
      fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => nvdResponse("CVE-2024-0001", "1.1.2") }),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    await queryPackageCves("openssl", "1.1.1f", deps, db);
    await queryPackageCves("openssl", "1.1.1f", deps, db);

    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to a stale cache entry when the NVD request fails", async () => {
    const okDeps: NvdClientDeps = {
      fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => nvdResponse("CVE-2024-0001", "1.1.2") }),
      wait: vi.fn().mockResolvedValue(undefined),
    };
    await queryPackageCves("openssl", "1.1.1f", okDeps, db);
    // 캐시를 만료된 것처럼 되돌린다
    db.prepare(`UPDATE nvd_query_cache SET fetched_at = ? WHERE package_name = ?`).run(
      new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      "openssl",
    );

    const failingDeps: NvdClientDeps = {
      fetch: vi.fn().mockRejectedValue(new Error("network down")),
      wait: vi.fn().mockResolvedValue(undefined),
    };
    const entries = await queryPackageCves("openssl", "1.1.1f", failingDeps, db);

    expect(entries).toHaveLength(1); // 만료됐어도 폴백으로 사용
    expect(entries[0].cveId).toBe("CVE-2024-0001");
  });

  it("treats a cache row with malformed JSON as a cache miss and falls back to a live fetch", async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nvd_query_cache (package_name, raw_response, fetched_at) VALUES (?, ?, ?)`,
    ).run("openssl", "{not valid json", now);

    const deps: NvdClientDeps = {
      fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => nvdResponse("CVE-2024-0003", "1.1.2") }),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const entries = await queryPackageCves("openssl", "1.1.1f", deps, db);

    expect(entries).toHaveLength(1);
    expect(entries[0].cveId).toBe("CVE-2024-0003");
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
});
