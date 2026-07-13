import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createServerAsset } from "@/lib/assets/store";
import { listCveMatches, replaceInstalledPackages } from "./store";
import type { DeltaCveEntry } from "./deltaClient";
import { deltaIntervalMs, runDeltaCycle, type DeltaWatcherDeps } from "./deltaWatcher";
import { listFeedForDisplay } from "./feedStore";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function server(hostIp: string) {
  return createServerAsset(
    { displayName: `srv-${hostIp}`, hostIp, hostname: "h", sshPort: 22, authType: "password", username: "root", secret: "pw" },
    db,
  );
}

function entry(overrides: Partial<DeltaCveEntry> = {}): DeltaCveEntry {
  return {
    cveId: "CVE-2026-9000",
    cvssScore: 9.8,
    severity: "critical",
    summary: "delta test",
    publishedAt: "2026-07-12T00:00:00.000",
    product: "openssl",
    versionRange: { versionStartIncluding: "3.0.0", versionEndExcluding: "3.0.14" },
    ...overrides,
  };
}

function deps(overrides: Partial<DeltaWatcherDeps> = {}): DeltaWatcherDeps {
  return {
    fetchRecentCves: vi.fn().mockResolvedValue([entry()]),
    analyzeCveImpact: vi.fn().mockResolvedValue({ impact: "영향", remediation: "조치" }),
    env: {},
    ...overrides,
  };
}

function getWatermarkRow(): string | undefined {
  return (db.prepare(`SELECT watermark FROM cve_delta_state WHERE id = 1`).get() as { watermark: string } | undefined)
    ?.watermark;
}

describe("runDeltaCycle", () => {
  it("reverse-matches delta CVEs against the installed-package inventory across assets", async () => {
    const a1 = server("10.0.0.1");
    const a2 = server("10.0.0.2");
    const now = new Date("2026-07-13T02:00:00Z");
    replaceInstalledPackages(a1.id, [{ name: "openssl", version: "3.0.10" }], now, db); // 범위 안
    replaceInstalledPackages(a2.id, [{ name: "openssl", version: "3.0.14" }], now, db); // 범위 밖(EndExcluding)

    await runDeltaCycle(now, deps(), db);

    expect(listCveMatches(a1.id, db).map((m) => m.cveId)).toEqual(["CVE-2026-9000"]);
    expect(listCveMatches(a2.id, db)).toEqual([]);
  });

  it("matches product names case-insensitively and records the installed package name", async () => {
    const a = server("10.0.0.3");
    const now = new Date("2026-07-13T02:00:00Z");
    replaceInstalledPackages(a.id, [{ name: "OpenSSL", version: "3.0.10" }], now, db);

    await runDeltaCycle(now, deps(), db);

    const [match] = listCveMatches(a.id, db);
    expect(match.packageName).toBe("OpenSSL");
  });

  it("runs AI analysis only for new critical matches, capped per cycle", async () => {
    const a = server("10.0.0.4");
    const now = new Date("2026-07-13T02:00:00Z");
    replaceInstalledPackages(a.id, [{ name: "openssl", version: "3.0.10" }], now, db);
    // critical 11 + high 1 → AI는 critical만, 상한 10으로 잘린다.
    const entries = [
      ...Array.from({ length: 11 }, (_, i) => entry({ cveId: `CVE-2026-90${String(i).padStart(2, "0")}` })),
      entry({ cveId: "CVE-2026-8000", cvssScore: 8.0, severity: "high" }),
    ];
    const analyzeCveImpact = vi.fn().mockResolvedValue({ impact: "i", remediation: "r" });
    const d = deps({ fetchRecentCves: vi.fn().mockResolvedValue(entries), analyzeCveImpact });

    await runDeltaCycle(now, d, db);

    expect(analyzeCveImpact).toHaveBeenCalledTimes(10);
    // high 매치도 기록 자체는 된다.
    expect(listCveMatches(a.id, db).map((m) => m.cveId)).toContain("CVE-2026-8000");
    // 이미 본 매치는 재실행해도 AI 재분석 없음(isNew=false).
    analyzeCveImpact.mockClear();
    await runDeltaCycle(new Date("2026-07-13T04:00:00Z"), d, db);
    expect(analyzeCveImpact).not.toHaveBeenCalled();
  });

  it("advances the watermark on success and keeps it on failure", async () => {
    const now = new Date("2026-07-13T02:00:00Z");
    await runDeltaCycle(now, deps(), db);
    expect(getWatermarkRow()).toBe(now.toISOString());

    const later = new Date("2026-07-13T04:00:00Z");
    const failing = deps({ fetchRecentCves: vi.fn().mockRejectedValue(new Error("NVD down")) });
    await expect(runDeltaCycle(later, failing, db)).rejects.toThrow("NVD down");
    expect(getWatermarkRow()).toBe(now.toISOString()); // 유지

    // 다음 성공 사이클은 유지된 워터마크에서 시작한다.
    const d = deps();
    await runDeltaCycle(later, d, db);
    expect(d.fetchRecentCves).toHaveBeenCalledWith(new Date(now.toISOString()), later);
    expect(getWatermarkRow()).toBe(later.toISOString());
  });

  it("uses now - interval as the first window (no backfill) and clamps to 120 days", async () => {
    const now = new Date("2026-07-13T02:00:00Z");
    const d = deps(); // env: {} → 무키 2시간
    await runDeltaCycle(now, d, db);
    expect(d.fetchRecentCves).toHaveBeenCalledWith(new Date(now.getTime() - 2 * 60 * 60 * 1000), now);

    // 워터마크가 120일보다 오래됐으면 now-120일로 클램프.
    db.prepare(`UPDATE cve_delta_state SET watermark = ? WHERE id = 1`).run("2025-01-01T00:00:00.000Z");
    const d2 = deps();
    await runDeltaCycle(now, d2, db);
    expect(d2.fetchRecentCves).toHaveBeenCalledWith(new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000), now);
  });

  it("is idempotent when the same window is processed twice", async () => {
    const a = server("10.0.0.5");
    const now = new Date("2026-07-13T02:00:00Z");
    replaceInstalledPackages(a.id, [{ name: "openssl", version: "3.0.10" }], now, db);
    const d = deps();

    await runDeltaCycle(now, d, db);
    db.prepare(`DELETE FROM cve_delta_state`).run(); // 워터마크 소실 시나리오
    await runDeltaCycle(now, d, db);

    expect(listCveMatches(a.id, db)).toHaveLength(1);
  });

  it("stores every fetched CVE in feed_cves (matched or not) and dedups per cve_id (#feed)", async () => {
    const a = server("10.0.9.1");
    const now = new Date("2026-07-13T02:00:00Z");
    replaceInstalledPackages(a.id, [{ name: "openssl", version: "3.0.10" }], now, db);
    // 매칭되는 openssl 1건 + 매칭 안 되는 nginx 1건 + 같은 cve_id가 product 전개로 2번 등장
    const entries = [
      entry({ cveId: "CVE-2026-9000", product: "openssl", versionRange: { versionStartIncluding: "3.0.0", versionEndExcluding: "3.0.14" } }),
      entry({ cveId: "CVE-2026-9000", product: "openssl-libs", versionRange: { versionStartIncluding: "3.0.0", versionEndExcluding: "3.0.14" } }),
      entry({ cveId: "CVE-2026-7777", product: "nginx", cvssScore: 8.2, severity: "high", versionRange: {} }),
    ];
    const d = deps({ fetchRecentCves: vi.fn().mockResolvedValue(entries) });

    await runDeltaCycle(now, d, db);

    const feed = listFeedForDisplay(now, db);
    // 미매칭(nginx)도 저장되고, 중복 cve_id(CVE-2026-9000)는 1건으로.
    expect(feed.map((f) => f.cveId).sort()).toEqual(["CVE-2026-7777", "CVE-2026-9000"]);
    // 매칭 반영: openssl은 자산 1대 매칭, nginx는 0.
    const byId = Object.fromEntries(feed.map((f) => [f.cveId, f]));
    expect(byId["CVE-2026-9000"].assetMatches).toBe(1);
    expect(byId["CVE-2026-7777"].assetMatches).toBe(0);
  });

  it("prunes feed entries older than 14 days at the end of a cycle (#feed)", async () => {
    const now = new Date("2026-07-13T02:00:00Z");
    // 사전에 오래된 피드 행을 심고, 이번 사이클이 prune 하는지 확인.
    db.prepare(
      `INSERT INTO feed_cves (cve_id, published_at, severity, cvss_score, summary, first_collected_at, collected_at)
       VALUES ('CVE-STALE', null, 'high', 7.5, 's', '2026-06-01T00:00:00.000Z', '2026-06-20T00:00:00.000Z')`,
    ).run();
    const d = deps({ fetchRecentCves: vi.fn().mockResolvedValue([]) });

    await runDeltaCycle(now, d, db);

    expect(listFeedForDisplay(now, db).map((f) => f.cveId)).not.toContain("CVE-STALE");
  });
});

describe("deltaIntervalMs", () => {
  it("returns 30 minutes with NVD_API_KEY and 2 hours without", () => {
    expect(deltaIntervalMs({ NVD_API_KEY: "k" })).toBe(30 * 60 * 1000);
    expect(deltaIntervalMs({})).toBe(2 * 60 * 60 * 1000);
  });
});
