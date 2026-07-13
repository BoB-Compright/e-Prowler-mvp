import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { createInMemoryDb } from "@/lib/db";
import { createServerAsset } from "@/lib/assets/store";
import type { NvdCveEntry } from "./nvdClient";
import {
  lastPackageCollectionAt,
  listCveMatches,
  listInstalledPackages,
  listServerAssetsDueForCveCheck,
  replaceInstalledPackages,
  setCveAiAnalysis,
  setCveDismissed,
  upsertCveMatch,
  listRecentCriticalCveAlerts,
  countRecentCriticalCveAlertsByAsset,
  listRecentMatchedCves,
} from "./store";

let db: Database;

function server(overrides: Partial<Parameters<typeof createServerAsset>[0]> = {}) {
  return createServerAsset(
    { displayName: "srv", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "root", secret: "pw", ...overrides },
    db,
  );
}

function cveEntry(overrides: Partial<NvdCveEntry> = {}): NvdCveEntry {
  return {
    cveId: "CVE-2024-0001", cvssScore: 9.1, severity: "critical", summary: "example",
    publishedAt: "2026-01-01T00:00:00.000", versionRange: {}, ...overrides,
  };
}

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("installed packages", () => {
  it("replaces the full package set on each collection", () => {
    const asset = server();
    replaceInstalledPackages(asset.id, [{ name: "curl", version: "7.0" }], new Date(2026, 6, 8), db);
    replaceInstalledPackages(asset.id, [{ name: "openssl", version: "1.1.1" }], new Date(2026, 6, 9), db);

    expect(listInstalledPackages(asset.id, db)).toEqual([{ name: "openssl", version: "1.1.1" }]);
    expect(lastPackageCollectionAt(asset.id, db)).toBe(new Date(2026, 6, 9).toISOString());
  });
});

describe("listServerAssetsDueForCveCheck", () => {
  it("includes server assets with no collection yet or one older than 24h, excludes recent ones", () => {
    const never = server({ hostIp: "10.0.0.1" });
    const stale = server({ hostIp: "10.0.0.2" });
    const fresh = server({ hostIp: "10.0.0.3" });
    const now = new Date(2026, 6, 8, 12, 0, 0);
    replaceInstalledPackages(stale.id, [], new Date(2026, 6, 7, 11, 0, 0), db); // 25시간 전
    replaceInstalledPackages(fresh.id, [], new Date(2026, 6, 8, 6, 0, 0), db); // 6시간 전

    const due = listServerAssetsDueForCveCheck(now, db).map((a) => a.id);

    expect(due).toEqual(expect.arrayContaining([never.id, stale.id]));
    expect(due).not.toContain(fresh.id);
  });
});

describe("cve matches", () => {
  it("inserts a new match with isNew=true and preserves first_seen_at on re-check", () => {
    const asset = server();
    const t1 = new Date(2026, 6, 8, 3, 0, 0);
    const first = upsertCveMatch({ assetId: asset.id, packageName: "openssl", packageVersion: "1.1.1f", entry: cveEntry() }, t1, db);
    expect(first.isNew).toBe(true);

    const t2 = new Date(2026, 6, 9, 3, 0, 0);
    const second = upsertCveMatch({ assetId: asset.id, packageName: "openssl", packageVersion: "1.1.1g", entry: cveEntry() }, t2, db);
    expect(second.isNew).toBe(false);
    expect(second.match.firstSeenAt).toBe(t1.toISOString());
    expect(second.match.checkedAt).toBe(t2.toISOString());
    expect(second.match.packageVersion).toBe("1.1.1g");
  });

  it("lists matches newest-published first, undated last, cvss as tie-breaker", () => {
    const asset = server();
    const now = new Date(2026, 6, 13);
    // 발표일 역순이 아닌 순서로 넣어 정렬이 실제로 동작하는지 확인한다.
    upsertCveMatch({ assetId: asset.id, packageName: "a", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2023-1111", publishedAt: "2023-05-01T00:00:00.000", cvssScore: 9.8 }) }, now, db);
    upsertCveMatch({ assetId: asset.id, packageName: "b", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-2222", publishedAt: "2026-06-01T00:00:00.000", cvssScore: 5.0 }) }, now, db);
    upsertCveMatch({ assetId: asset.id, packageName: "c", packageVersion: "1", entry: cveEntry({ cveId: "CVE-0000-0000", publishedAt: null, cvssScore: 10.0 }) }, now, db);
    upsertCveMatch({ assetId: asset.id, packageName: "d", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-3333", publishedAt: "2026-06-01T00:00:00.000", cvssScore: 8.0 }) }, now, db);

    const ids = listCveMatches(asset.id, db).map((m) => m.cveId);

    // 최신 발표일 우선, 같은 날짜는 CVSS 높은 순, 발표일 없는 항목은 마지막.
    expect(ids).toEqual(["CVE-2026-3333", "CVE-2026-2222", "CVE-2023-1111", "CVE-0000-0000"]);
  });

  it("sets AI analysis and dismissed flag", () => {
    const asset = server();
    const { match } = upsertCveMatch({ assetId: asset.id, packageName: "openssl", packageVersion: "1.1.1f", entry: cveEntry() }, new Date(), db);

    setCveAiAnalysis(match.id, "심각한 영향", "패키지 업그레이드", db);
    setCveDismissed(match.id, true, db);

    const [updated] = listCveMatches(asset.id, db);
    expect(updated.aiImpact).toBe("심각한 영향");
    expect(updated.aiRemediation).toBe("패키지 업그레이드");
    expect(updated.dismissed).toBe(true);
  });
});

describe("cve alerts (derived)", () => {
  it("lists only non-dismissed critical matches first seen within 7 days, newest first, with asset names", () => {
    const asset = server({ hostIp: "10.0.1.1", displayName: "웹서버-1" });
    const now = new Date("2026-07-13T12:00:00Z");
    const recent = new Date("2026-07-12T12:00:00Z"); // 1일 전
    const boundary = new Date("2026-07-06T12:00:00Z"); // 정확히 7일 전 → 포함
    const old = new Date("2026-07-06T11:59:59Z"); // 7일 + 1초 전 → 제외

    upsertCveMatch({ assetId: asset.id, packageName: "a", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-0001", cvssScore: 9.8 }) }, recent, db);
    upsertCveMatch({ assetId: asset.id, packageName: "b", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-0002", cvssScore: 9.8 }) }, boundary, db);
    upsertCveMatch({ assetId: asset.id, packageName: "c", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-0003", cvssScore: 9.8 }) }, old, db);
    upsertCveMatch({ assetId: asset.id, packageName: "d", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-0004", cvssScore: 8.0, severity: "high" }) }, recent, db); // high → 제외 (주의: cveEntry 기본값이 severity critical이라 반드시 override)
    const dismissedMatch = upsertCveMatch({ assetId: asset.id, packageName: "e", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-0005", cvssScore: 9.8 }) }, recent, db);
    setCveDismissed(dismissedMatch.match.id, true, db);

    const alerts = listRecentCriticalCveAlerts(now, db);

    expect(alerts.map((a) => a.cveId)).toEqual(["CVE-2026-0001", "CVE-2026-0002"]);
    expect(alerts[0].assetName).toBe("웹서버-1");
  });

  it("counts recent critical alerts per asset", () => {
    const a1 = server({ hostIp: "10.0.1.2" });
    const a2 = server({ hostIp: "10.0.1.3" });
    const now = new Date("2026-07-13T12:00:00Z");
    const recent = new Date("2026-07-12T12:00:00Z");
    upsertCveMatch({ assetId: a1.id, packageName: "a", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-0101", cvssScore: 9.8 }) }, recent, db);
    upsertCveMatch({ assetId: a1.id, packageName: "b", packageVersion: "1", entry: cveEntry({ cveId: "CVE-2026-0102", cvssScore: 9.8 }) }, recent, db);

    const counts = countRecentCriticalCveAlertsByAsset(now, db);

    expect(counts.get(a1.id)).toBe(2);
    expect(counts.get(a2.id)).toBeUndefined();
  });
});

describe("listRecentMatchedCves", () => {
  it("returns distinct matched CVEs newer than since, korean summary when cached, capped", () => {
    const asset = server({ hostIp: "10.0.2.1", displayName: "웹서버" });
    const before = new Date("2026-07-13T00:00:00Z");
    const after = new Date("2026-07-13T01:00:00Z");
    // since 이전 매칭 → 제외
    upsertCveMatch({ assetId: asset.id, packageName: "a", packageVersion: "1", entry: cveEntry({ cveId: "CVE-OLD" }) }, before, db);
    // since 이후 매칭 2건 + 한 건은 두 자산(distinct 카운트)
    const asset2 = server({ hostIp: "10.0.2.2" });
    upsertCveMatch({ assetId: asset.id, packageName: "b", packageVersion: "1", entry: cveEntry({ cveId: "CVE-NEW1", cvssScore: 9.8 }) }, after, db);
    upsertCveMatch({ assetId: asset2.id, packageName: "b", packageVersion: "1", entry: cveEntry({ cveId: "CVE-NEW1", cvssScore: 9.8 }) }, after, db);
    upsertCveMatch({ assetId: asset.id, packageName: "c", packageVersion: "1", entry: cveEntry({ cveId: "CVE-NEW2" }) }, after, db);
    db.prepare(`INSERT INTO cve_translations (cve_id, summary_ko, translated_at) VALUES ('CVE-NEW1','한국어 요약','2026-07-13T00:00:00Z')`).run();

    const rows = listRecentMatchedCves(before.toISOString(), 10, db);
    const ids = rows.map((r) => r.cveId);
    expect(ids).toContain("CVE-NEW1");
    expect(ids).toContain("CVE-NEW2");
    expect(ids).not.toContain("CVE-OLD");
    const n1 = rows.find((r) => r.cveId === "CVE-NEW1")!;
    expect(n1.assetMatches).toBe(2);
    expect(n1.summary).toBe("한국어 요약"); // 캐시 있으면 한국어
    const n2 = rows.find((r) => r.cveId === "CVE-NEW2")!;
    expect(n2.summary).toBe("example"); // 캐시 없으면 영문 폴백(cveEntry 기본 summary)
  });

  it("respects the limit", () => {
    const asset = server({ hostIp: "10.0.2.3" });
    const t = new Date("2026-07-13T02:00:00Z");
    for (let i = 0; i < 5; i++) {
      upsertCveMatch({ assetId: asset.id, packageName: `p${i}`, packageVersion: "1", entry: cveEntry({ cveId: `CVE-X${i}` }) }, t, db);
    }
    expect(listRecentMatchedCves("2026-07-13T00:00:00Z", 3, db)).toHaveLength(3);
  });
});
