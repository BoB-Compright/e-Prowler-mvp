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
  return new Request("http://localhost/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assets", () => {
  it("normalizes whitespace-only os to null for repo assets", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({
      type: "repo",
      displayName: "test",
      repoUrl: "https://github.com/x/test",
      os: "   ",
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ os: null });
  });

  it("rejects numeric os in JSON body for repo assets", async () => {
    const { POST } = await import("./route");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({
      type: "repo",
      displayName: "test",
      repoUrl: "https://github.com/x/test",
      os: 12345,
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = body.asset;
    expect(asset).toMatchObject({ os: null });
  });

  it("normalizes whitespace-only owner to null for repo assets", async () => {
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({
      type: "repo",
      displayName: "test",
      repoUrl: "https://github.com/x/test",
      owner: "   ",
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ owner: null });
  });

  it("normalizes whitespace-only os to null for server assets", async () => {
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({
      type: "server",
      displayName: "web-01",
      hostIp: "10.0.0.5",
      hostname: "web-01",
      sshPort: 22,
      authType: "password",
      username: "admin",
      secret: "pw",
      os: "   ",
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ os: null });
  });

  it("rejects numeric os in JSON body for server assets", async () => {
    const { getAsset } = await import("@/lib/assets/store");
    const { POST } = await import("./route");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest({
      type: "server",
      displayName: "web-01",
      hostIp: "10.0.0.5",
      hostname: "web-01",
      sshPort: 22,
      authType: "password",
      username: "admin",
      secret: "pw",
      os: 12345,
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    const asset = getAsset(body.asset.id);
    expect(asset).toMatchObject({ os: null });
  });
});
