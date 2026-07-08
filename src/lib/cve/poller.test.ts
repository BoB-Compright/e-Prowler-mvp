import type { Database } from "better-sqlite3";
import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createServerAsset } from "@/lib/assets/store";
import type { Asset } from "@/lib/assets/types";
import type { NvdCveEntry } from "./nvdClient";
import type { InstalledPackage } from "./packageCollector";
import { listCveMatches, listInstalledPackages } from "./store";
import { checkAssetForCves, checkDueAssets, startCvePoller, stopCvePoller, type CveMonitorDeps } from "./poller";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  stopCvePoller();
  vi.useRealTimers();
});

function cveEntry(overrides: Partial<NvdCveEntry> = {}): NvdCveEntry {
  return {
    cveId: "CVE-2024-0001", cvssScore: 9.1, severity: "critical", summary: "s",
    publishedAt: null, versionRange: {}, ...overrides,
  };
}

function server(hostIp: string) {
  return createServerAsset(
    { displayName: hostIp, hostIp, hostname: "h", sshPort: 22, authType: "password", username: "root", secret: "pw" },
    db,
  );
}

describe("checkAssetForCves", () => {
  it("collects packages, stores matches, and analyzes new high-severity findings", async () => {
    const asset = server("10.0.0.1");
    const deps: CveMonitorDeps = {
      collectInstalledPackages: vi.fn().mockResolvedValue([{ name: "openssl", version: "1.1.1f" }]),
      queryPackageCves: vi.fn().mockResolvedValue([cveEntry()]),
      analyzeCveImpact: vi.fn().mockResolvedValue({ impact: "심각", remediation: "업그레이드" }),
    };

    await checkAssetForCves(asset, new Date(), deps, db);

    expect(listInstalledPackages(asset.id, db)).toEqual([{ name: "openssl", version: "1.1.1f" }]);
    const matches = listCveMatches(asset.id, db);
    expect(matches).toHaveLength(1);
    expect(matches[0].aiImpact).toBe("심각");
    expect(deps.analyzeCveImpact).toHaveBeenCalledTimes(1);
  });

  it("does not call AI analysis for medium/low severity or for an already-seen match", async () => {
    const asset = server("10.0.0.2");
    const deps: CveMonitorDeps = {
      collectInstalledPackages: vi.fn().mockResolvedValue([{ name: "curl", version: "7.0" }]),
      queryPackageCves: vi.fn().mockResolvedValue([cveEntry({ cveId: "CVE-2024-0002", cvssScore: 5.0, severity: "medium" })]),
      analyzeCveImpact: vi.fn(),
    };

    await checkAssetForCves(asset, new Date(), deps, db);
    await checkAssetForCves(asset, new Date(), deps, db); // 재확인 — 이미 있는 매칭이라도 재분석하지 않음

    expect(deps.analyzeCveImpact).not.toHaveBeenCalled();
    expect(listCveMatches(asset.id, db)).toHaveLength(1);
  });
});

describe("checkDueAssets", () => {
  it("isolates a failing asset and keeps checking the rest", async () => {
    const a = server("10.0.0.1");
    const b = server("10.0.0.2");

    const deps: CveMonitorDeps = {
      collectInstalledPackages: vi.fn().mockImplementation(async (asset: Asset) => {
        if (asset.id === a.id) throw new Error("ssh 실패");
        return [{ name: "curl", version: "7.0" }];
      }),
      queryPackageCves: vi.fn().mockResolvedValue([]),
      analyzeCveImpact: vi.fn(),
    };

    await checkDueAssets(new Date(), deps, db);

    expect(listInstalledPackages(a.id, db)).toEqual([]);
    expect(listInstalledPackages(b.id, db)).toEqual([{ name: "curl", version: "7.0" }]);
  });
});

describe("startCvePoller / stopCvePoller", () => {
  it("checks immediately on start and does not start a second interval when called twice", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(global, "setInterval");
    const deps: CveMonitorDeps = {
      collectInstalledPackages: vi.fn().mockResolvedValue([]),
      queryPackageCves: vi.fn().mockResolvedValue([]),
      analyzeCveImpact: vi.fn(),
    };

    startCvePoller(deps, db);
    startCvePoller(deps, db);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not start a second checkDueAssets cycle while the first is still in flight", async () => {
    vi.useFakeTimers();
    const asset = server("10.0.0.9");

    let resolveCollect: (pkgs: InstalledPackage[]) => void = () => {};
    const collectInstalledPackages = vi.fn().mockImplementation(
      () =>
        new Promise<InstalledPackage[]>((resolve) => {
          resolveCollect = resolve;
        }),
    );
    const deps: CveMonitorDeps = {
      collectInstalledPackages,
      queryPackageCves: vi.fn().mockResolvedValue([]),
      analyzeCveImpact: vi.fn(),
    };

    startCvePoller(deps, db);
    // 시작 시 즉시 실행되는 첫 사이클이 이 자산의 패키지 수집에서 대기(pending) 상태로 멈춰 있다.
    expect(collectInstalledPackages).toHaveBeenCalledTimes(1);

    // 첫 사이클이 아직 끝나지 않은 채로 인터벌 한 틱(60초, CHECK_INTERVAL_MS)을 넘긴다.
    await vi.advanceTimersByTimeAsync(60_000);

    // 재진입 가드가 없다면 새 사이클이 시작되어 같은(아직 처리되지 않은) 자산을 다시 처리했을 것이다.
    // 가드가 있으므로 호출 횟수는 여전히 1이어야 한다.
    expect(collectInstalledPackages).toHaveBeenCalledTimes(1);

    // 정리: 대기 중이던 첫 사이클을 완료시켜 가드를 해제한다 (다른 테스트에 영향이 남지 않도록).
    resolveCollect([]);
    await vi.advanceTimersByTimeAsync(0);
  });
});
