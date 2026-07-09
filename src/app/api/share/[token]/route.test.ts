import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
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

// POST only calls req.json() on the request, so a plain Request is a
// sufficient runtime stand-in for NextRequest.
function jsonRequest(token: string, password: string): NextRequest {
  return new Request(`http://localhost/api/share/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }) as unknown as NextRequest;
}

describe("POST /api/share/[token]", () => {
  it("includes a verdict per asset but no count/detail/CVE fields", async () => {
    const { createProject } = await import("@/lib/projects/store");
    const { createRepoAsset } = await import("@/lib/assets/store");
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { saveCheckResults } = await import("@/lib/checks/store");
    const { POST } = await import("./route");

    const project = createProject({
      name: "nh-pay",
      pmName: "홍길동",
      pmEmail: "pm@nh.example",
      sharePassword: "secret1234",
    });

    const passAsset = createRepoAsset({
      displayName: "pass-repo",
      repoUrl: "https://github.com/nh/pass.git",
      projectId: project.id,
    });
    const passRun = createRun(passAsset.repoUrl!, "git", passAsset.id);
    saveCheckResults(passRun.id, [{ id: "C-01", status: "pass", evidence: "ok" }]);
    updateRunStage(passRun.id, "done", "succeeded");

    const failAsset = createRepoAsset({
      displayName: "fail-repo",
      repoUrl: "https://github.com/nh/fail.git",
      projectId: project.id,
    });
    const failRun = createRun(failAsset.repoUrl!, "git", failAsset.id);
    saveCheckResults(failRun.id, [{ id: "C-02", status: "fail", evidence: "uid 0 (CVE-2024-1234)" }]);
    updateRunStage(failRun.id, "done", "succeeded");

    const errorAsset = createRepoAsset({
      displayName: "error-repo",
      repoUrl: "https://github.com/nh/error.git",
      projectId: project.id,
    });
    const errorRun = createRun(errorAsset.repoUrl!, "git", errorAsset.id);
    updateRunStage(errorRun.id, "build", "failed", { errorMessage: "docker build exited 1" });

    const noRunAsset = createRepoAsset({
      displayName: "no-run-repo",
      repoUrl: "https://github.com/nh/norun.git",
      projectId: project.id,
    });

    const res = await POST(jsonRequest(project.shareToken, "secret1234"), {
      params: Promise.resolve({ token: project.shareToken }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    const byId = new Map(
      (body.assets as Array<{ id: string; verdict: string }>).map((a) => [a.id, a]),
    );
    expect(byId.get(passAsset.id)?.verdict).toBe("pass");
    expect(byId.get(failAsset.id)?.verdict).toBe("fail");
    expect(byId.get(errorAsset.id)?.verdict).toBe("error");
    expect(byId.get(noRunAsset.id)?.verdict).toBe("none");

    // 판정 배지 이외의 상세 필드(건수/항목/CVE)는 계속 비노출이어야 한다.
    for (const asset of body.assets as Array<Record<string, unknown>>) {
      expect(Object.keys(asset).sort()).toEqual(["displayName", "id", "type", "verdict"]);
    }
    for (const run of body.runs as Array<Record<string, unknown>>) {
      expect(run).not.toHaveProperty("checks");
      expect(run).not.toHaveProperty("cve");
      expect(run).not.toHaveProperty("riskSummary");
    }
  });
});
