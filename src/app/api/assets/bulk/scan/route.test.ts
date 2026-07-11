import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 실제 파이프라인이 돌지 않게 스캔 시작부만 스텁
const startAssetsBulkScanMock = vi.fn();
vi.mock("@/lib/pipeline/bulkScan", () => ({
  startAssetsBulkScan: (...args: unknown[]) => startAssetsBulkScanMock(...args),
}));

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = ":memory:";
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
  startAssetsBulkScanMock.mockReset();
});

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets/bulk/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function authCookie(): Promise<string> {
  const { createUser } = await import("@/lib/auth/users");
  const { createSession } = await import("@/lib/auth/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/auth/constants");
  const user = createUser("tester", "test-pw");
  const { token } = createSession(user.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/assets/bulk/scan", () => {
  it("세션 없으면 401", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a"] }));
    expect(res.status).toBe(401);
    expect(startAssetsBulkScanMock).not.toHaveBeenCalled();
  });

  it("빈 assetIds는 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: [] }, await authCookie()));
    expect(res.status).toBe(400);
  });

  it("배치 시작 시 202 + batchId/started/skipped", async () => {
    startAssetsBulkScanMock.mockReturnValue({
      batchId: "b1", startedRunIds: ["r1", "r2"], skipped: ["a3"],
    });
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a1", "a2", "a3"] }, await authCookie()));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ batchId: "b1", started: 2, skipped: ["a3"] });
  });

  it("전부 건너뛰면 409 (빈 배치 미생성)", async () => {
    startAssetsBulkScanMock.mockReturnValue({ batchId: null, startedRunIds: [], skipped: ["a1"] });
    const { POST } = await import("./route");
    const res = await POST(jsonRequest({ assetIds: ["a1"] }, await authCookie()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.skipped).toEqual(["a1"]);
  });
});
