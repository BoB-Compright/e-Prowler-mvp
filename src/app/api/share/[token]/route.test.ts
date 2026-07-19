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
      expect(Object.keys(asset).sort()).toEqual(["displayName", "id", "kind", "type", "verdict"]);
    }

    // 응답 최상위는 project/assets/perAsset/score만 노출한다(runs/findings는 perAsset으로 대체).
    expect(Object.keys(body).sort()).toEqual(["assets", "perAsset", "project", "score"]);

    // 미점검(no-run) 자산과 빌드 실패(succeeded 아님) 자산 모두 run:null, checks:[]다.
    const perAssetById = new Map(
      (body.perAsset as Array<{ assetId: string; run: unknown; checks: unknown[] }>).map((p) => [
        p.assetId,
        p,
      ]),
    );
    expect(perAssetById.get(errorAsset.id)?.run).toBeNull();
    expect(perAssetById.get(errorAsset.id)?.checks).toEqual([]);
    expect(perAssetById.get(noRunAsset.id)?.run).toBeNull();
    expect(perAssetById.get(noRunAsset.id)?.checks).toEqual([]);
  });

  it("perAsset에 자산별 최신 성공 run의 전체 데코 항목을 반환하고 CVE는 없다", async () => {
    const { createProject } = await import("@/lib/projects/store");
    const { createServerAsset, createRepoAsset } = await import("@/lib/assets/store");
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { saveCheckResults } = await import("@/lib/checks/store");
    const { POST } = await import("./route");

    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" });
    const asset = createServerAsset({ displayName: "srv", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "u", secret: "p", projectId: project.id });
    const run = createRun(asset.hostIp!, "server", asset.id);
    // pass·fail·review·skip 섞인 결과를 저장.
    saveCheckResults(run.id, [
      { id: "U-01", status: "pass", evidence: "PermitRootLogin prohibit-password" },
      { id: "U-13", status: "fail", evidence: "uid 0 (CVE-2024-1234)" },
      { id: "U-42", status: "review", evidence: "manual check needed" },
      { id: "U-44", status: "skip", evidence: "n/a" },
    ]);
    updateRunStage(run.id, "done", "succeeded");

    const noRunAsset = createRepoAsset({
      displayName: "no-run",
      repoUrl: "https://github.com/nh/norun.git",
      projectId: project.id,
    });

    const res = await POST(jsonRequest(project.shareToken, "pw"), {
      params: Promise.resolve({ token: project.shareToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const entry = body.perAsset.find((p: { assetId: string }) => p.assetId === asset.id);
    expect(entry.run).not.toBeNull();
    expect(entry.run.id).toBe(run.id);
    expect(entry.checks.length).toBe(4);
    // 전체 상태가 포함(pass도 포함 — 취약/검토만이 아님)
    expect(entry.checks.some((c: { status: string }) => c.status === "pass")).toBe(true);
    expect(entry.checks.some((c: { status: string }) => c.status === "review")).toBe(true);
    expect(entry.checks.some((c: { status: string }) => c.status === "skip")).toBe(true);
    // 데코 필드
    const any = entry.checks[0];
    expect(any).toHaveProperty("title");
    expect(any).toHaveProperty("evidence");
    expect(any).toHaveProperty("reason");
    // CVE 미노출
    expect(body).not.toHaveProperty("cveMatches");
    expect(entry).not.toHaveProperty("cveMatches");

    // 미점검 자산은 run:null, checks:[]
    const noRunEntry = body.perAsset.find((p: { assetId: string }) => p.assetId === noRunAsset.id);
    expect(noRunEntry.run).toBeNull();
    expect(noRunEntry.checks).toEqual([]);
  });

  it("응답에 프로젝트 종합 점수(score/grade)를 포함한다", async () => {
    const { createProject } = await import("@/lib/projects/store");
    const { createRepoAsset, createServerAsset } = await import("@/lib/assets/store");
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

    // U-01(KISA, severity: High)을 fail로 저장해 criticalHighCheckFindings > 0을 만든다.
    const failAsset = createServerAsset({
      displayName: "fail-server",
      hostIp: "10.0.0.2",
      hostname: "h2",
      sshPort: 22,
      authType: "password",
      username: "u",
      secret: "p",
      projectId: project.id,
    });
    const failRun = createRun(failAsset.hostIp!, "server", failAsset.id);
    saveCheckResults(failRun.id, [{ id: "U-01", status: "fail", evidence: "root 원격 접속 허용" }]);
    updateRunStage(failRun.id, "done", "succeeded");

    // 미점검(run 없음) 자산 — uncheckedAssets 감점 확인용.
    const noRunAsset = createRepoAsset({
      displayName: "no-run-repo",
      repoUrl: "https://github.com/nh/norun.git",
      projectId: project.id,
    });
    void noRunAsset;

    const res = await POST(jsonRequest(project.shareToken, "secret1234"), {
      params: Promise.resolve({ token: project.shareToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.score).toBeTruthy();
    expect(typeof body.score.score).toBe("number");
    expect(body.score.score).toBeGreaterThanOrEqual(0);
    expect(body.score.score).toBeLessThanOrEqual(100);
    expect(body.score.score).toBeLessThan(100);
    expect(["safe", "caution", "warning", "danger"]).toContain(body.score.grade);
  });
});
