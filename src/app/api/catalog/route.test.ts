import { beforeEach, describe, expect, it, vi } from "vitest";

// The catalog itself is static data, but the handler now runs the session
// guard against the shared getDb() singleton — use the same isolation
// pattern as the other route tests (reset module registry + in-memory DB).
beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
});

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

describe("GET /api/catalog", () => {
  it("returns 401 without a valid session (no cookie, and forged cookie)", async () => {
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
    const { GET } = await import("./route");

    const noCookie = await GET(new Request("http://localhost/api/catalog"));
    expect(noCookie.status).toBe(401);

    const forged = await GET(
      new Request("http://localhost/api/catalog", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=garbage` },
      }),
    );
    expect(forged.status).toBe(401);
  });

  it("includes the framework registry alongside items and summary", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/catalog", { headers: { cookie: await authCookie() } }),
    );
    const body = await response.json();

    expect(body.frameworks).toEqual([
      { id: "kisa", name: "KISA 주요정보통신기반시설 가이드" },
    ]);
    expect(body.summary.byFramework.kisa).toBe(102);
    expect(body.items[0].frameworkId).toBe("kisa");
  });
});
