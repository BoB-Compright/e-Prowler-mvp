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

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new Request("http://localhost/api/assets/import/create", {
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

describe("POST /api/assets/import/create — session guard", () => {
  it("returns 401 without any session cookie", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      jsonRequest({ repoUrl: "https://github.com/x/x", projectName: "p", dockerfilePaths: ["Dockerfile"] }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/assets/import/create", () => {
  it("프로젝트와 이미지당 자산을 만들고 중복은 skip으로 보고한다", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();

    const res = await POST(
      jsonRequest(
        {
          repoUrl: "https://github.com/nh/test.git",
          projectName: "nh-import",
          dockerfilePaths: ["backend/Dockerfile", "frontend/Dockerfile"],
        },
        cookie,
      ),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.skipped).toEqual([]);
    expect(typeof body.projectId).toBe("string");

    const { listProjects } = await import("@/lib/projects/store");
    const projects = listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(body.projectId);
    expect(projects[0].name).toBe("nh-import");

    const { getDb } = await import("@/lib/db");
    const assets = getDb()
      .prepare("SELECT display_name, dockerfile_path, project_id FROM assets WHERE type = 'repo' ORDER BY dockerfile_path")
      .all() as { display_name: string; dockerfile_path: string; project_id: string }[];
    expect(assets).toHaveLength(2);
    expect(assets[0]).toEqual({
      display_name: "test / backend/Dockerfile",
      dockerfile_path: "backend/Dockerfile",
      project_id: body.projectId,
    });
    expect(assets[1]).toEqual({
      display_name: "test / frontend/Dockerfile",
      dockerfile_path: "frontend/Dockerfile",
      project_id: body.projectId,
    });

    // 같은 레포/경로로 다시 create 요청하면 전부 중복 — 409를 반환하고
    // 빈 프로젝트를 만들지 않으며 기존 프로젝트 정보를 알려준다.
    const res2 = await POST(
      jsonRequest(
        {
          repoUrl: "https://github.com/nh/test.git",
          projectName: "nh-import-2",
          dockerfilePaths: ["backend/Dockerfile", "frontend/Dockerfile"],
        },
        cookie,
      ),
    );
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.skipped).toEqual(["backend/Dockerfile", "frontend/Dockerfile"]);
    expect(body2.existingProjects).toEqual([{ id: body.projectId, name: "nh-import" }]);

    // 두 번째 요청으로 프로젝트가 추가 생성되지 않았다.
    expect(listProjects()).toHaveLength(1);
  });

  it("일부만 중복이면 중복분만 skip으로 보고한다", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();

    await POST(
      jsonRequest(
        {
          repoUrl: "https://github.com/nh/partial.git",
          projectName: "nh-partial",
          dockerfilePaths: ["backend/Dockerfile"],
        },
        cookie,
      ),
    );

    const res = await POST(
      jsonRequest(
        {
          repoUrl: "https://github.com/nh/partial.git",
          projectName: "nh-partial-2",
          dockerfilePaths: ["backend/Dockerfile", "frontend/Dockerfile"],
        },
        cookie,
      ),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.skipped).toEqual(["backend/Dockerfile"]);

    // 새로 만들 자산이 있으므로 프로젝트는 정상 생성된다(총 2개).
    const { listProjects } = await import("@/lib/projects/store");
    expect(listProjects()).toHaveLength(2);
  });

  it("빈 선택은 400", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(
      jsonRequest({ repoUrl: "https://github.com/nh/test.git", projectName: "p", dockerfilePaths: [] }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it("유효하지 않은 레포 URL이면 400", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(
      jsonRequest({ repoUrl: "not-a-url", projectName: "p", dockerfilePaths: ["Dockerfile"] }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it("프로젝트명이 없으면 400", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(
      jsonRequest(
        { repoUrl: "https://github.com/nh/test.git", projectName: "  ", dockerfilePaths: ["Dockerfile"] },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("경로 탈출(../..)을 시도하는 dockerfilePaths는 400이며 프로젝트도 생성하지 않는다", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(
      jsonRequest(
        {
          repoUrl: "https://github.com/nh/test.git",
          projectName: "p",
          dockerfilePaths: ["../../../Dockerfile"],
        },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("유효한 Dockerfile 경로가 없습니다");

    const { listProjects } = await import("@/lib/projects/store");
    expect(listProjects()).toHaveLength(0);
  });

  it("절대 경로 dockerfilePath는 거부된다", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(
      jsonRequest(
        {
          repoUrl: "https://github.com/nh/test.git",
          projectName: "p",
          dockerfilePaths: ["/etc/passwd"],
        },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
    const { listProjects } = await import("@/lib/projects/store");
    expect(listProjects()).toHaveLength(0);
  });

  it("앞뒤 공백이 있는 dockerfilePath는 trim되어 저장된다", async () => {
    const { POST } = await import("./route");
    const cookie = await authCookie();
    const res = await POST(
      jsonRequest(
        {
          repoUrl: "https://github.com/nh/test.git",
          projectName: "p",
          dockerfilePaths: ["  backend/Dockerfile  "],
        },
        cookie,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(1);

    const { getDb } = await import("@/lib/db");
    const assets = getDb()
      .prepare("SELECT dockerfile_path FROM assets WHERE type = 'repo'")
      .all() as { dockerfile_path: string }[];
    expect(assets).toHaveLength(1);
    expect(assets[0].dockerfile_path).toBe("backend/Dockerfile");
  });
});
