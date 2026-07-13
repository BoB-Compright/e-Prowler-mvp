import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function runRequest(cookie?: string): Request {
  return new Request("http://localhost/api/runs/x", {
    headers: cookie ? { cookie } : undefined,
  });
}

async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("tester", "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("GET /api/runs/[id] cveMatches (#cve)", () => {
  it("includes this asset's CVE matches for a server run", async () => {
    const { createServerAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const { upsertCveMatch } = await import("@/lib/cve/store");
    const { GET } = await import("./route");

    const asset = createServerAsset({
      displayName: "web-01",
      hostIp: "10.0.0.5",
      hostname: "web-01",
      sshPort: 22,
      authType: "password",
      username: "admin",
      secret: "pw",
    });
    const run = createRun(asset.hostIp!, "server", asset.id);
    const { match } = upsertCveMatch({
      assetId: asset.id,
      packageName: "openssl",
      packageVersion: "1.1.1",
      entry: {
        cveId: "CVE-2024-0001",
        cvssScore: 9.1,
        severity: "critical",
        summary: "example",
        publishedAt: "2024-01-01T00:00:00.000Z",
        versionRange: {},
      },
    });

    const res = await GET(runRequest(await authCookie()), params(run.id));
    const body = await res.json();

    expect(body.cveMatches).toEqual([match]);
  });

  it("returns an empty array for a repo (git) run", async () => {
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun } = await import("@/lib/pipeline/runs");
    const { GET } = await import("./route");

    const asset = createRepoAsset({
      displayName: "nh-pay-gateway",
      repoUrl: "https://github.com/nh/pay.git",
    });
    const run = createRun(asset.repoUrl!, "git", asset.id);

    const res = await GET(runRequest(await authCookie()), params(run.id));
    const body = await res.json();

    expect(body.cveMatches).toEqual([]);
  });

  it("returns an empty array for a run with no assetId", async () => {
    const { createRun } = await import("@/lib/pipeline/runs");
    const { GET } = await import("./route");

    const run = createRun("https://github.com/nh/pay.git");

    const res = await GET(runRequest(await authCookie()), params(run.id));
    const body = await res.json();

    expect(body.cveMatches).toEqual([]);
  });
});

describe("GET /api/runs/[id] mitigation (#mitigation)", () => {
  it("attaches the static mitigation guide to each check (#mitigation)", async () => {
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { saveCheckResults } = await import("@/lib/checks/store");
    const { GET } = await import("./route");

    const run = createRun("https://github.com/nh/x.git", "git", null);
    saveCheckResults(run.id, [{ id: "U-01", status: "fail", evidence: "e" }]);
    updateRunStage(run.id, "done", "succeeded");

    const res = await GET(new Request("http://localhost/api/runs/x", { headers: { cookie: await authCookie() } }), params(run.id));
    const body = await res.json();
    const u01 = body.checks.find((c: { id: string }) => c.id === "U-01");
    expect(u01.mitigation).not.toBeNull();
    expect(u01.mitigation.fix.length).toBeGreaterThan(0);
  });
});
