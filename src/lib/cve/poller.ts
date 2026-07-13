import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Asset } from "@/lib/assets/types";
import { collectInstalledPackages as realCollectInstalledPackages, type InstalledPackage } from "./packageCollector";
import { listServerAssetsDueForCveCheck, replaceInstalledPackages } from "./store";

// 인벤토리 수집기(과거 "CVE 폴러"에서 전환). 예전에는 여기서 패키지별 NVD
// keywordSearch로 전 연도 CVE를 매칭했으나(22k 과다탐지·재유입의 원인) 제거했다.
// 이제 이 모듈은 자산의 설치 패키지 목록(installed_packages)만 주기적으로 갱신하고,
// 실제 CVE 매칭은 델타워처(deltaWatcher: NVD 최근 피드 → 인벤토리 역매칭)가 전담한다.
const CHECK_INTERVAL_MS = 60_000;

export interface InventoryDeps {
  collectInstalledPackages: (asset: Asset) => Promise<InstalledPackage[]>;
}

const defaultDeps: InventoryDeps = {
  collectInstalledPackages: realCollectInstalledPackages,
};

// 한 자산의 패키지 인벤토리를 수집해 저장한다(델타워처가 역매칭할 대상). CVE 매칭은 하지 않는다.
export async function refreshAssetInventory(
  asset: Asset,
  now: Date = new Date(),
  deps: InventoryDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  const packages = await deps.collectInstalledPackages(asset);
  replaceInstalledPackages(asset.id, packages, now, db);
}

// 갱신 주기가 지난 자산들의 인벤토리를 갱신한다. 한 자산 실패는 격리한다.
export async function refreshDueInventories(
  now: Date = new Date(),
  deps: InventoryDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  const due = listServerAssetsDueForCveCheck(now, db);
  for (const asset of due) {
    try {
      await refreshAssetInventory(asset, now, deps, db);
    } catch {
      // 이 자산만 건너뛰고 다음 주기에 재시도한다.
    }
  }
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;
let cycleInFlight = false;

async function runCycleIfIdle(deps: InventoryDeps, db: Database): Promise<void> {
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    await refreshDueInventories(new Date(), deps, db);
  } finally {
    cycleInFlight = false;
  }
}

export function startInventoryPoller(deps: InventoryDeps = defaultDeps, db: Database = getDb()): void {
  if (intervalHandle) return;
  void runCycleIfIdle(deps, db);
  intervalHandle = setInterval(() => {
    void runCycleIfIdle(deps, db);
  }, CHECK_INTERVAL_MS);
}

export function stopInventoryPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
