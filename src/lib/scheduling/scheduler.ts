import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getAsset } from "@/lib/assets/store";
import { listDueSchedules, recordSkipped, recordTriggered } from "./store";
import { hasActiveRun, triggerRunForAsset } from "./trigger";
import type { RunTriggerType } from "@/lib/pipeline/types";
import type { Asset } from "@/lib/assets/types";

export interface SchedulerDeps {
  hasActiveRun: (assetId: string, db?: Database) => boolean;
  triggerRunForAsset: (asset: Asset, triggerType: RunTriggerType, db?: Database) => Promise<string>;
}

const defaultDeps: SchedulerDeps = {
  hasActiveRun,
  triggerRunForAsset: (asset, triggerType, db) => triggerRunForAsset(asset, triggerType, undefined, db),
};

const CHECK_INTERVAL_MS = 60_000;

let isChecking = false;

export async function checkDueSchedules(
  now: Date = new Date(),
  deps: SchedulerDeps = defaultDeps,
  db: Database = getDb(),
): Promise<void> {
  if (isChecking) return;
  isChecking = true;
  try {
    const due = listDueSchedules(now, db);
    for (const schedule of due) {
      const asset = getAsset(schedule.assetId, db);
      if (!asset) {
        // 정상 경로라면 Task 5의 cascade 삭제로 이 상태가 발생하지 않지만 방어적으로 처리한다.
        recordSkipped(schedule.id, "연결된 자산을 찾을 수 없음", now, db);
        continue;
      }
      if (deps.hasActiveRun(asset.id, db)) {
        recordSkipped(schedule.id, "이미 진행 중인 run 존재", now, db);
        continue;
      }
      await deps.triggerRunForAsset(asset, "scheduled", db);
      recordTriggered(schedule.id, now, db);
    }
  } finally {
    isChecking = false;
  }
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;

// 즉시 1회 체크 + 이후 1분 간격 반복. 서버가 꺼져 있던 동안 놓친 스케줄은
// (next_run_at <= now 조건 덕분에) 이 즉시 체크에서 자연히 캐치업된다.
export function startScheduler(deps: SchedulerDeps = defaultDeps, db: Database = getDb()): void {
  if (intervalHandle) return;
  void checkDueSchedules(new Date(), deps, db);
  intervalHandle = setInterval(() => {
    void checkDueSchedules(new Date(), deps, db);
  }, CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
