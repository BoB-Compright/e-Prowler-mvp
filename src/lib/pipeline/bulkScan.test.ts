import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

// 파이프라인 실행부는 전부 스텁 — 이 테스트는 배치/런 행 생성과 skip 규칙만 검증한다.
// (ServerScanDeps 타입은 vi.resetModules 하에서 값 import 없이 캐스팅으로 충족)
function stubDeps() {
  return {
    runAnsibleForServer: vi.fn().mockResolvedValue([]),
    retryOnConnectionFailure: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    evaluateAllChecks: vi.fn().mockReturnValue([]),
    saveCheckResults: vi.fn(),
    analyzeAndSaveChecks: vi.fn().mockResolvedValue(undefined),
    runPipeline: vi.fn().mockResolvedValue(undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("startAssetsBulkScan", () => {
  it("선택 자산으로 배치를 만들고 run을 배치에 붙인다 (repo+server 혼합)", async () => {
    const { createRepoAsset, createServerAsset } = await import("@/lib/assets/store");
    const { startAssetsBulkScan } = await import("./bulkScan");
    const { getDb } = await import("@/lib/db");

    const repo = createRepoAsset({ displayName: "r1", repoUrl: "https://github.com/x/r1" });
    const server = createServerAsset({
      displayName: "s1", hostIp: "10.0.0.1", hostname: "s1.example.com", sshPort: 22,
      authType: "password", username: "root", secret: "pw",
    });

    const result = startAssetsBulkScan([repo.id, server.id], stubDeps());
    expect(result.batchId).not.toBeNull();
    expect(result.startedRunIds).toHaveLength(2);
    expect(result.skipped).toEqual([]);

    const rows = getDb()
      .prepare(`SELECT asset_id, batch_id FROM runs ORDER BY created_at`)
      .all() as { asset_id: string; batch_id: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.batch_id === result.batchId)).toBe(true);

    const batch = getDb()
      .prepare(`SELECT project_id FROM scan_batches WHERE id = ?`)
      .get(result.batchId) as { project_id: string | null };
    expect(batch.project_id).toBeNull();
  });

  it("실행 중 점검이 있는 자산은 건너뛰고 skipped로 보고한다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const { startAssetsBulkScan } = await import("./bulkScan");

    const busy = createRepoAsset({ displayName: "busy", repoUrl: "https://github.com/x/busy" });
    const idle = createRepoAsset({ displayName: "idle", repoUrl: "https://github.com/x/idle" });
    createRun(busy.repoUrl!, "git", busy.id); // status 'running'으로 생성됨

    const result = startAssetsBulkScan([busy.id, idle.id], stubDeps());
    expect(result.skipped).toEqual([busy.id]);
    expect(result.startedRunIds).toHaveLength(1);
  });

  it("전부 건너뛰면 배치를 만들지 않는다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const { startAssetsBulkScan } = await import("./bulkScan");
    const { getDb } = await import("@/lib/db");

    const busy = createRepoAsset({ displayName: "busy", repoUrl: "https://github.com/x/busy2" });
    createRun(busy.repoUrl!, "git", busy.id);

    const result = startAssetsBulkScan([busy.id], stubDeps());
    expect(result).toEqual({ batchId: null, startedRunIds: [], skipped: [busy.id] });
    expect(getDb().prepare(`SELECT count(*) as c FROM scan_batches`).get()).toEqual({ c: 0 });
  });

  it("존재하지 않는 자산 id는 무시한다", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { startAssetsBulkScan } = await import("./bulkScan");
    const repo = createRepoAsset({ displayName: "r", repoUrl: "https://github.com/x/r" });
    const result = startAssetsBulkScan([repo.id, "no-such-id"], stubDeps());
    expect(result.startedRunIds).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });
});
