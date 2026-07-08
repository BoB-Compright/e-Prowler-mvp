import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Asset } from "@/lib/assets/types";
import { analyzeCveImpact as realAnalyzeCveImpact } from "./aiAnalysis";
import { collectInstalledPackages as realCollectInstalledPackages, type InstalledPackage } from "./packageCollector";
import { queryPackageCves as realQueryPackageCves, type NvdCveEntry } from "./nvdClient";
import {
  listServerAssetsDueForCveCheck,
  replaceInstalledPackages,
  setCveAiAnalysis,
  upsertCveMatch,
  type CveMatch,
} from "./store";

const HIGH_SEVERITY_CVSS_THRESHOLD = 7.0;
const CHECK_INTERVAL_MS = 60_000;

export interface CveMonitorDeps {
  collectInstalledPackages: (asset: Asset) => Promise<InstalledPackage[]>;
  queryPackageCves: (packageName: string, installedVersion: string, db?: Database) => Promise<NvdCveEntry[]>;
  analyzeCveImpact: (match: CveMatch) => Promise<{ impact: string; remediation: string } | null>;
}

const defaultDeps: CveMonitorDeps = {
  collectInstalledPackages: realCollectInstalledPackages,
  queryPackageCves: (name, version, db) => realQueryPackageCves(name, version, undefined, db),
  analyzeCveImpact: realAnalyzeCveImpact,
};

export async function checkAssetForCves(
  asset: Asset,
  now: Date = new Date(),
  deps: CveMonitorDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  const packages = await deps.collectInstalledPackages(asset);
  replaceInstalledPackages(asset.id, packages, now, db);

  for (const pkg of packages) {
    const entries = await deps.queryPackageCves(pkg.name, pkg.version, db);
    for (const entry of entries) {
      const { match, isNew } = upsertCveMatch(
        { assetId: asset.id, packageName: pkg.name, packageVersion: pkg.version, entry },
        now,
        db,
      );
      if (isNew && match.cvssScore !== null && match.cvssScore >= HIGH_SEVERITY_CVSS_THRESHOLD) {
        const analysis = await deps.analyzeCveImpact(match);
        if (analysis) {
          setCveAiAnalysis(match.id, analysis.impact, analysis.remediation, db);
        }
      }
    }
  }
}

// fleet scan(A2)과 동일한 실패 격리 원칙 — 한 자산이 실패해도 나머지는 계속 처리한다.
export async function checkDueAssets(
  now: Date = new Date(),
  deps: CveMonitorDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  const due = listServerAssetsDueForCveCheck(now, db);
  for (const asset of due) {
    try {
      await checkAssetForCves(asset, now, deps, db);
    } catch {
      // 이 자산만 건너뛰고 다음 24시간 주기에 재시도한다.
    }
  }
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;
let cycleInFlight = false;

async function runCycleIfIdle(deps: CveMonitorDeps, db: Database): Promise<void> {
  // 이전 사이클이 아직 실행 중이면(SSH 타임아웃, NVD 레이트리밋 대기 등으로 60초를 넘길 수 있음)
  // 새 사이클을 시작하지 않는다 — 중복 SSH 세션/NVD 쿼리 및 레이트리미터 우회를 방지한다.
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    await checkDueAssets(new Date(), deps, db);
  } finally {
    cycleInFlight = false;
  }
}

export function startCvePoller(deps: CveMonitorDeps = defaultDeps, db: Database = getDb()): void {
  if (intervalHandle) return;
  void runCycleIfIdle(deps, db);
  intervalHandle = setInterval(() => {
    void runCycleIfIdle(deps, db);
  }, CHECK_INTERVAL_MS);
}

export function stopCvePoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
