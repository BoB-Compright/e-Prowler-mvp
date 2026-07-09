import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same isolation pattern as src/app/api/runs/route.test.ts: reset the module
// registry and point DATABASE_PATH at ":memory:" so every test gets its own
// fresh in-memory DB via the shared getDb() singleton.
beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/runs/[id]/export", () => {
  it("returns 404 when the run does not exist", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/runs/nope/export"), params("nope"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for a still-running run", async () => {
    const { createRun } = await import("@/lib/pipeline/runs");
    const { GET } = await import("./route");

    const run = createRun("https://github.com/nh/pay.git");

    const res = await GET(new Request("http://localhost/api/runs/x/export"), params(run.id));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a failed run", async () => {
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { GET } = await import("./route");

    const run = createRun("https://github.com/nh/pay.git");
    updateRunStage(run.id, "done", "failed", { errorMessage: "boom" });

    const res = await GET(new Request("http://localhost/api/runs/x/export"), params(run.id));
    expect(res.status).toBe(400);
  });

  it("returns a UTF-8 BOM-prefixed CSV with a download filename for a succeeded run", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { saveCheckResults } = await import("@/lib/checks/store");
    const { GET } = await import("./route");

    const asset = createRepoAsset({
      displayName: "nh-pay-gateway",
      repoUrl: "https://github.com/nh/pay.git",
    });
    const run = createRun(asset.repoUrl!, "git", asset.id);
    saveCheckResults(run.id, [{ id: "U-01", status: "pass", evidence: "ok" }]);
    updateRunStage(run.id, "done", "succeeded");

    const res = await GET(new Request("http://localhost/api/runs/x/export"), params(run.id));
    expect(res.status).toBe(200);

    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent("nh-pay-gateway"));

    // Response.text() decodes via TextDecoder, which strips a leading BOM by
    // spec -- check the raw bytes instead to confirm it's actually on the
    // wire (buildReportCsv's own unit tests already cover the BOM at the
    // string level).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain("U-01");
  });
});
