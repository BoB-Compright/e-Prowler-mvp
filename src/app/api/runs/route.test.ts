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

function jsonRequest(body: unknown, cookie?: string): Request {
  return new Request("http://localhost/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

// Creates a real user + session in the same in-memory DB the route handler
// uses (same module registry — everything is imported after resetModules),
// and returns the Cookie header value for authenticated requests.
async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("tester", "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/runs — session guard", () => {
  it("returns 401 without a valid session (no cookie, and forged cookie)", async () => {
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
    const { POST } = await import("./route");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noCookie = await POST(jsonRequest({ assetId: "whatever" }) as any);
    expect(noCookie.status).toBe(401);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forged = await POST(jsonRequest({ assetId: "whatever" }, `${SESSION_COOKIE_NAME}=garbage`) as any);
    expect(forged.status).toBe(401);
  });
});

describe("POST /api/runs — duplicate-start protection", () => {
  it("returns 409 and does not create a new run when the asset already has a running run", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun, listRuns } = await import("@/lib/pipeline/runs");
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const asset = createRepoAsset({
      displayName: "nh-pay-gateway",
      repoUrl: "https://github.com/nh/pay.git",
    });
    const existingRun = createRun(asset.repoUrl!, "git", asset.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({ assetId: asset.id }, cookie) as any);

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
    const cookie = await authCookie();

    const asset = createRepoAsset({
      displayName: "nh-pay-gateway",
      repoUrl: "https://github.com/nh/pay.git",
    });
    const finishedRun = createRun(asset.repoUrl!, "git", asset.id);
    updateRunStage(finishedRun.id, "done", "succeeded");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({ assetId: asset.id }, cookie) as any);

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.run.assetId).toBe(asset.id);

    const runs = listRuns().filter((r) => r.assetId === asset.id);
    expect(runs).toHaveLength(2);
  });
});
