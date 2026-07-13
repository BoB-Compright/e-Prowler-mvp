import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createServerAsset } from "@/lib/assets/store";
import { upsertCveMatch, setCveDismissed } from "@/lib/cve/store";
import type { NvdCveEntry } from "@/lib/cve/nvdClient";
import {
  upsertFeedCve,
  pruneFeedCves,
  listFeedForDisplay,
  relativeLabel,
  actionRequired,
  FEED_RETENTION_DAYS,
} from "./feedStore";

let db: Database;
beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function feedEntry(over: Partial<Parameters<typeof upsertFeedCve>[0]> = {}) {
  return { cveId: "CVE-2026-0001", publishedAt: "2026-07-01T00:00:00.000Z", severity: "critical" as const, cvssScore: 9.5, summary: "example", ...over };
}
function cveEntry(over: Partial<NvdCveEntry> = {}): NvdCveEntry {
  return { cveId: "CVE-2026-0001", cvssScore: 9.5, severity: "critical", summary: "example", publishedAt: null, versionRange: {}, ...over };
}
function server(ip: string) {
  return createServerAsset({ displayName: `s-${ip}`, hostIp: ip, hostname: "h", sshPort: 22, authType: "password", username: "u", secret: "p" }, db);
}

describe("feed_cves store", () => {
  it("inserts, and on re-collect updates collected_at but keeps first_collected_at", () => {
    const t1 = new Date("2026-07-10T00:00:00Z");
    upsertFeedCve(feedEntry(), t1, db);
    const t2 = new Date("2026-07-13T00:00:00Z");
    upsertFeedCve(feedEntry({ summary: "updated" }), t2, db);

    const rows = listFeedForDisplay(t2, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe("updated");
    const raw = db.prepare(`SELECT collected_at, first_collected_at FROM feed_cves WHERE cve_id = ?`).get("CVE-2026-0001") as { collected_at: string; first_collected_at: string };
    expect(raw.collected_at).toBe(t2.toISOString());
    expect(raw.first_collected_at).toBe(t1.toISOString());
  });

  it("prunes rows collected more than 14 days ago, keeps the boundary", () => {
    const now = new Date("2026-07-13T12:00:00Z");
    upsertFeedCve(feedEntry({ cveId: "CVE-OLD" }), new Date("2026-06-28T12:00:00Z"), db); // 15일 전 → 삭제
    upsertFeedCve(feedEntry({ cveId: "CVE-EDGE" }), new Date("2026-06-29T12:00:00Z"), db); // 정확히 14일 전 → 유지
    upsertFeedCve(feedEntry({ cveId: "CVE-NEW" }), new Date("2026-07-13T00:00:00Z"), db);

    const deleted = pruneFeedCves(now, db);
    expect(deleted).toBe(1);
    expect(listFeedForDisplay(now, db).map((r) => r.cveId).sort()).toEqual(["CVE-EDGE", "CVE-NEW"]);
    expect(FEED_RETENTION_DAYS).toBe(14);
  });

  it("counts distinct matched assets (dismissed excluded) as assetMatches and derives 조치 필요", () => {
    const now = new Date("2026-07-13T00:00:00Z");
    upsertFeedCve(feedEntry({ cveId: "CVE-MATCH" }), now, db);
    upsertFeedCve(feedEntry({ cveId: "CVE-NONE" }), now, db);
    const a1 = server("10.0.0.1");
    const a2 = server("10.0.0.2");
    upsertCveMatch({ assetId: a1.id, packageName: "p", packageVersion: "1", entry: cveEntry({ cveId: "CVE-MATCH" }) }, now, db);
    upsertCveMatch({ assetId: a2.id, packageName: "p", packageVersion: "1", entry: cveEntry({ cveId: "CVE-MATCH" }) }, now, db);
    const dm = upsertCveMatch({ assetId: a2.id, packageName: "p", packageVersion: "1", entry: cveEntry({ cveId: "CVE-NONE" }) }, now, db);
    setCveDismissed(dm.match.id, true, db);

    const byId = Object.fromEntries(listFeedForDisplay(now, db).map((r) => [r.cveId, r]));
    expect(byId["CVE-MATCH"].assetMatches).toBe(2);
    expect(actionRequired(byId["CVE-MATCH"].assetMatches)).toBe(true);
    expect(byId["CVE-NONE"].assetMatches).toBe(0); // dismissed 제외 → 0
    expect(actionRequired(byId["CVE-NONE"].assetMatches)).toBe(false);
  });

  it("relativeLabel renders 방금/N분 전/N시간 전/N일 전", () => {
    const now = new Date("2026-07-13T12:00:00Z");
    expect(relativeLabel("2026-07-13T11:59:30Z", now)).toBe("방금");
    expect(relativeLabel("2026-07-13T11:45:00Z", now)).toBe("15분 전");
    expect(relativeLabel("2026-07-13T10:00:00Z", now)).toBe("2시간 전");
    expect(relativeLabel("2026-07-11T12:00:00Z", now)).toBe("2일 전");
  });
});
