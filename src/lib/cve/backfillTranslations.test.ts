import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createServerAsset } from "@/lib/assets/store";
import { upsertCveMatch } from "@/lib/cve/store";
import type { NvdCveEntry } from "@/lib/cve/nvdClient";
import { backfillCveTranslations } from "./backfillTranslations";

let db: Database;
beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});
function cveEntry(over: Partial<NvdCveEntry>): NvdCveEntry {
  return { cveId: "X", cvssScore: 9, severity: "critical", summary: "s", publishedAt: null, versionRange: {}, ...over };
}

describe("backfillCveTranslations", () => {
  it("translates distinct un-translated cve summaries up to the limit, highest CVSS first", async () => {
    const a = createServerAsset({ displayName: "s", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "u", secret: "p" }, db);
    const now = new Date("2026-07-13T00:00:00Z");
    upsertCveMatch({ assetId: a.id, packageName: "p", packageVersion: "1", entry: cveEntry({ cveId: "CVE-LOW", cvssScore: 5, summary: "low sev" }) }, now, db);
    upsertCveMatch({ assetId: a.id, packageName: "p", packageVersion: "1", entry: cveEntry({ cveId: "CVE-HIGH", cvssScore: 9.8, summary: "high sev" }) }, now, db);
    // CVE-DONE은 이미 번역돼 있음 → 제외
    upsertCveMatch({ assetId: a.id, packageName: "p", packageVersion: "1", entry: cveEntry({ cveId: "CVE-DONE", cvssScore: 8, summary: "done" }) }, now, db);
    db.prepare(`INSERT INTO cve_translations (cve_id, summary_ko, translated_at) VALUES ('CVE-DONE','이미','2026-07-13T00:00:00Z')`).run();

    const translate = vi.fn(async (items: { cveId: string; summary: string }[]) => new Map(items.map((i) => [i.cveId, `ko-${i.cveId}`])));
    const count = await backfillCveTranslations(1, { translate, aiEnabled: () => true }, db);

    // limit=1, CVSS 높은 CVE-HIGH만 번역, 이미 된 CVE-DONE 제외
    expect(count).toBe(1);
    const done = db.prepare(`SELECT cve_id FROM cve_translations ORDER BY cve_id`).all() as { cve_id: string }[];
    expect(done.map((r) => r.cve_id).sort()).toEqual(["CVE-DONE", "CVE-HIGH"]);
  });
});
