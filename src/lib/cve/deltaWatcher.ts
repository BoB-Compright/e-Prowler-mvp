import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { analyzeCveImpact as realAnalyzeCveImpact } from "./aiAnalysis";
import { fetchRecentCves as realFetchRecentCves, type DeltaCveEntry } from "./deltaClient";
import { isVersionInRange } from "./versionRange";
import { setCveAiAnalysis, upsertCveMatch, type CveMatch } from "./store";

const KEYED_INTERVAL_MS = 30 * 60 * 1000; // NVD_API_KEY 있을 때
const NO_KEY_INTERVAL_MS = 2 * 60 * 60 * 1000; // 무키
const MAX_WINDOW_MS = 120 * 24 * 60 * 60 * 1000; // NVD lastMod 윈도우 상한(120일)
const MAX_AI_ANALYSES_PER_CYCLE = 10; // 비용 방어: 초과분은 기록만 하고 분석 생략

export function deltaIntervalMs(env: Record<string, string | undefined> = process.env): number {
  return env.NVD_API_KEY ? KEYED_INTERVAL_MS : NO_KEY_INTERVAL_MS;
}

export interface DeltaWatcherDeps {
  fetchRecentCves: (windowStart: Date, windowEnd: Date) => Promise<DeltaCveEntry[]>;
  analyzeCveImpact: (match: CveMatch) => Promise<{ impact: string; remediation: string } | null>;
  env?: Record<string, string | undefined>;
}

const defaultDeps: DeltaWatcherDeps = {
  fetchRecentCves: (start, end) => realFetchRecentCves(start, end),
  analyzeCveImpact: realAnalyzeCveImpact,
};

function getWatermark(db: Database): string | null {
  const row = db.prepare(`SELECT watermark FROM cve_delta_state WHERE id = 1`).get() as
    | { watermark: string }
    | undefined;
  return row?.watermark ?? null;
}

function setWatermark(iso: string, db: Database): void {
  db.prepare(
    `INSERT INTO cve_delta_state (id, watermark) VALUES (1, @iso)
     ON CONFLICT(id) DO UPDATE SET watermark = @iso`,
  ).run({ iso });
}

// NVD 델타(윈도우 내 수정/발표 CVE)를 받아 로컬 인벤토리(installed_packages)에
// 역매칭한다. 기존 24h 폴러(자산→NVD 풀)와 반대 방향 — SSH 없이 동작한다.
// 워터마크는 사이클 전체가 성공했을 때만 전진: 실패하면 다음 틱이 같은 윈도우를
// 재시도하고, upsertCveMatch가 멱등이라 중복은 생기지 않는다.
export async function runDeltaCycle(
  now: Date = new Date(),
  deps: DeltaWatcherDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  const intervalMs = deltaIntervalMs(deps.env ?? process.env);
  const stored = getWatermark(db);
  // 첫 기동은 직전 주기만큼만(과거 백필은 기존 폴러 몫), NVD 제약(120일)으로 클램프.
  let windowStart = stored ? new Date(stored) : new Date(now.getTime() - intervalMs);
  const minStart = new Date(now.getTime() - MAX_WINDOW_MS);
  if (windowStart.getTime() < minStart.getTime()) windowStart = minStart;

  const entries = await deps.fetchRecentCves(windowStart, now);

  const packages = db
    .prepare(`SELECT DISTINCT asset_id, name, version FROM installed_packages WHERE name != ''`)
    .all() as { asset_id: string; name: string; version: string }[];
  const byName = new Map<string, { assetId: string; name: string; version: string }[]>();
  for (const pkg of packages) {
    const key = pkg.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push({ assetId: pkg.asset_id, name: pkg.name, version: pkg.version });
    byName.set(key, list);
  }

  let aiBudget = MAX_AI_ANALYSES_PER_CYCLE;
  for (const entry of entries) {
    const targets = byName.get(entry.product.toLowerCase()) ?? [];
    for (const pkg of targets) {
      if (!isVersionInRange(pkg.version, entry.versionRange)) continue;
      const { match, isNew } = upsertCveMatch(
        { assetId: pkg.assetId, packageName: pkg.name, packageVersion: pkg.version, entry },
        now,
        db,
      );
      // 사용자 결정: 경보·AI 분석은 critical만. (기존 폴러의 ≥7.0 기준은 별개 경로로 유지.)
      if (isNew && match.severity === "critical" && aiBudget > 0) {
        aiBudget--;
        const analysis = await deps.analyzeCveImpact(match);
        if (analysis) setCveAiAnalysis(match.id, analysis.impact, analysis.remediation, db);
      }
    }
  }

  setWatermark(now.toISOString(), db);
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;
let cycleInFlight = false;

async function runCycleIfIdle(deps: DeltaWatcherDeps, db: Database): Promise<void> {
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    await runDeltaCycle(new Date(), deps, db);
  } catch (err) {
    // NVD 장애 등 — 워터마크가 전진하지 않았으므로 다음 틱이 같은 윈도우를 재시도한다.
    // 지속 장애를 운영자가 알 수 있도록 로그는 남긴다(스펙: "로그만").
    console.warn("[cve-delta] 사이클 실패 — 다음 틱에 같은 윈도우 재시도:", err instanceof Error ? err.message : err);
  } finally {
    cycleInFlight = false;
  }
}

export function startCveDeltaWatcher(deps: DeltaWatcherDeps = defaultDeps, db: Database = getDb()): void {
  if (intervalHandle) return;
  void runCycleIfIdle(deps, db);
  intervalHandle = setInterval(() => {
    void runCycleIfIdle(deps, db);
  }, deltaIntervalMs());
}

export function stopCveDeltaWatcher(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
