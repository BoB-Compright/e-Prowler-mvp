import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// route.ts (and the lib modules it calls) reach the shared getDb() singleton,
// which is created lazily from process.env.DATABASE_PATH. Resetting the
// module registry + pointing DATABASE_PATH at ":memory:" before each test
// gives every test its own isolated in-memory database.
beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/runs — duplicate-start protection", () => {
  it("returns 409 and does not create a new run when the asset already has a running run", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun, listRuns } = await import("@/lib/pipeline/runs");
    const { POST } = await import("./route");

    const asset = createRepoAsset({
      displayName: "nh-pay-gateway",
      repoUrl: "https://github.com/nh/pay.git",
    });
    const existingRun = createRun(asset.repoUrl!, "git", asset.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({ assetId: asset.id }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeTruthy();

    const runs = listRuns().filter((r) => r.assetId === asset.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(existingRun.id);
  });

  it("allows starting a new run once the previous run for the asset has finished", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun, updateRunStage, listRuns } = await import("@/lib/pipeline/runs");
    const { POST } = await import("./route");

    const asset = createRepoAsset({
      displayName: "nh-pay-gateway",
      repoUrl: "https://github.com/nh/pay.git",
    });
    const finishedRun = createRun(asset.repoUrl!, "git", asset.id);
    updateRunStage(finishedRun.id, "done", "succeeded");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({ assetId: asset.id }) as any);

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.run.assetId).toBe(asset.id);

    const runs = listRuns().filter((r) => r.assetId === asset.id);
    expect(runs).toHaveLength(2);
  });
});
