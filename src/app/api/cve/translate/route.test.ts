import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function req(body: unknown, cookie?: string): Request {
  return new Request("http://localhost/api/cve/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const u = createUser("t", "pw");
  const { token } = createSession(u.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/cve/translate", () => {
  it("401 without session", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ items: [] }))).status).toBe(401);
  });

  it("returns cached translations", async () => {
    const { POST } = await import("./route");
    const { getDb } = await import("@/lib/db");
    getDb().prepare(`INSERT INTO cve_translations (cve_id, summary_ko, translated_at) VALUES ('CVE-1','한국어','2026-07-13T00:00:00Z')`).run();
    const res = await POST(req({ items: [{ cveId: "CVE-1", summary: "en" }] }, await authCookie()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translations: { "CVE-1": "한국어" } });
  });

  it("400 on malformed body", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ nope: 1 }, await authCookie()));
    expect(res.status).toBe(400);
  });
});
