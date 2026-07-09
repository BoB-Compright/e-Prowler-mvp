import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same isolation pattern as the sibling export/route.test.ts: reset the
// module registry and point DATABASE_PATH at ":memory:" so every test gets
// its own fresh in-memory DB via the shared getDb() singleton.
beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/runs/[id]/cancel", () => {
  it("returns 404 when the run does not exist", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/runs/nope/cancel", { method: "POST" }), params("nope"));
    expect(res.status).toBe(404);
  });

  it("cancels a running run: 200, status flips to cancelled, and a cancel event is recorded", async () => {
    const { createRun, listRunEvents } = await import("@/lib/pipeline/runs");
    const { POST } = await import("./route");

    const run = createRun("https://github.com/nh/pay.git");

    const res = await POST(new Request("http://localhost/api/runs/x/cancel", { method: "POST" }), params(run.id));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.run.status).toBe("cancelled");

    const events = listRunEvents(run.id);
    expect(events[events.length - 1].status).toBe("cancelled");
  });

  it("returns 409 for a run that already succeeded", async () => {
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { POST } = await import("./route");

    const run = createRun("https://github.com/nh/pay.git");
    updateRunStage(run.id, "done", "succeeded");

    const res = await POST(new Request("http://localhost/api/runs/x/cancel", { method: "POST" }), params(run.id));
    expect(res.status).toBe(409);
  });

  it("returns 409 for a run that already failed", async () => {
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { POST } = await import("./route");

    const run = createRun("https://github.com/nh/pay.git");
    updateRunStage(run.id, "build", "failed", { errorMessage: "boom" });

    const res = await POST(new Request("http://localhost/api/runs/x/cancel", { method: "POST" }), params(run.id));
    expect(res.status).toBe(409);
  });

  it("returns 409 for a run that was already cancelled (no double-cancel)", async () => {
    const { createRun, cancelRun } = await import("@/lib/pipeline/runs");
    const { POST } = await import("./route");

    const run = createRun("https://github.com/nh/pay.git");
    cancelRun(run.id, "먼저 취소됨");

    const res = await POST(new Request("http://localhost/api/runs/x/cancel", { method: "POST" }), params(run.id));
    expect(res.status).toBe(409);
  });
});
