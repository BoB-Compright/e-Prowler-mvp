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
