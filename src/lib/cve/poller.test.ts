import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createServerAsset } from "@/lib/assets/store";
import { listInstalledPackages, listCveMatches } from "@/lib/cve/store";
import { refreshAssetInventory, refreshDueInventories, type InventoryDeps } from "./poller";

let db: Database;
beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});
function server(ip: string) {
  return createServerAsset({ displayName: `s-${ip}`, hostIp: ip, hostname: "h", sshPort: 22, authType: "password", username: "u", secret: "p" }, db);
}
function deps(over: Partial<InventoryDeps> = {}): InventoryDeps {
  return { collectInstalledPackages: vi.fn().mockResolvedValue([{ name: "openssl", version: "3.0.10" }]), ...over };
}

describe("refreshAssetInventory", () => {
  it("collects and stores the package inventory without matching CVEs", async () => {
    const a = server("10.0.0.1");
    await refreshAssetInventory(a, new Date("2026-07-13T00:00:00Z"), deps(), db);
    expect(listInstalledPackages(a.id, db)).toEqual([{ name: "openssl", version: "3.0.10" }]);
    // A: NVD keywordSearch 매칭을 더 이상 하지 않으므로 cve_matches는 비어 있어야 한다.
    expect(listCveMatches(a.id, db)).toEqual([]);
  });
});

describe("refreshDueInventories", () => {
  it("refreshes inventory for each due asset, isolating per-asset failures", async () => {
    const a1 = server("10.0.0.1");
    const a2 = server("10.0.0.2");
    const collect = vi.fn()
      .mockRejectedValueOnce(new Error("ssh fail")) // 첫 자산 실패
      .mockResolvedValue([{ name: "curl", version: "8.0" }]);
    await refreshDueInventories(new Date("2026-07-13T00:00:00Z"), { collectInstalledPackages: collect }, db);
    // 한 자산 실패해도 나머지는 수집됨(둘 다 신규라 due).
    const all = listInstalledPackages(a1.id, db).concat(listInstalledPackages(a2.id, db));
    expect(all.some((p) => p.name === "curl")).toBe(true);
  });
});
