import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});
function req(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : undefined });
}
async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const u = createUser("t", "pw");
  const { token } = createSession(u.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("GET /api/cve/recent-matches", () => {
  it("401 without session", async () => {
    const { GET } = await import("./route");
    expect((await GET(req("http://localhost/api/cve/recent-matches"))).status).toBe(401);
  });

  it("returns matches since the given timestamp", async () => {
    const { createServerAsset } = await import("@/lib/assets/store");
    const { upsertCveMatch } = await import("@/lib/cve/store");
    const { GET } = await import("./route");
    const a = createServerAsset({ displayName: "s", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "u", secret: "p" });
    upsertCveMatch(
      { assetId: a.id, packageName: "p", packageVersion: "1", entry: { cveId: "CVE-2026-1", cvssScore: 9.8, severity: "critical", summary: "s", publishedAt: null, versionRange: {} } },
      new Date("2026-07-13T02:00:00Z"),
    );
    const res = await GET(req("http://localhost/api/cve/recent-matches?since=2026-07-13T00:00:00.000Z", await authCookie()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches.map((m: { cveId: string }) => m.cveId)).toContain("CVE-2026-1");
  });
});
