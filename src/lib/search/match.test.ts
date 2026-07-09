// src/lib/search/match.test.ts
import { describe, expect, it } from "vitest";
import { matchesAssetQuery, matchesProjectQuery } from "./match";
import type { Asset } from "@/lib/assets/types";
import type { Project } from "@/lib/projects/types";

function makeRepoAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    type: "repo",
    projectId: null,
    displayName: "nh-pay-gateway",
    repoUrl: "https://github.com/nh/pay-gateway.git",
    hostIp: null,
    hostname: null,
    sshPort: null,
    authType: null,
    username: null,
    encryptedSecret: null,
    os: null,
    owner: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeServerAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-2",
    type: "server",
    projectId: null,
    displayName: "운영 DB 서버",
    repoUrl: null,
    hostIp: "10.0.12.34",
    hostname: "db-prod-01",
    sshPort: 22,
    authType: "key",
    username: "opsuser",
    encryptedSecret: null,
    os: null,
    owner: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "NH페이 결제 시스템",
    pmName: "홍길동",
    pmEmail: "hong@nh.com",
    shareToken: "token",
    shareStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("matchesAssetQuery", () => {
  it("returns true for an empty or blank query", () => {
    expect(matchesAssetQuery(makeRepoAsset(), "")).toBe(true);
    expect(matchesAssetQuery(makeRepoAsset(), "   ")).toBe(true);
  });

  it("matches by display name, case-insensitively", () => {
    expect(matchesAssetQuery(makeRepoAsset(), "PAY-GATEWAY")).toBe(true);
    expect(matchesAssetQuery(makeRepoAsset(), "nomatch")).toBe(false);
  });

  it("matches repo assets by repo URL substring", () => {
    expect(matchesAssetQuery(makeRepoAsset(), "github.com/nh")).toBe(true);
  });

  it("matches server assets by host IP substring", () => {
    expect(matchesAssetQuery(makeServerAsset(), "10.0.12")).toBe(true);
    expect(matchesAssetQuery(makeServerAsset(), "192.168")).toBe(false);
  });

  it("does not throw when repoUrl or hostIp is null", () => {
    expect(matchesAssetQuery(makeRepoAsset({ repoUrl: null }), "anything")).toBe(false);
    expect(matchesAssetQuery(makeServerAsset({ hostIp: null }), "10.0")).toBe(false);
  });

  it("trims surrounding whitespace from the query", () => {
    expect(matchesAssetQuery(makeRepoAsset(), "  pay-gateway  ")).toBe(true);
  });
});

describe("matchesProjectQuery", () => {
  it("returns true for an empty or blank query", () => {
    expect(matchesProjectQuery(makeProject(), "")).toBe(true);
    expect(matchesProjectQuery(makeProject(), "  ")).toBe(true);
  });

  it("matches by name, case-insensitively and partially", () => {
    expect(matchesProjectQuery(makeProject(), "결제")).toBe(true);
    expect(matchesProjectQuery(makeProject({ name: "Alpha Project" }), "alpha")).toBe(true);
    expect(matchesProjectQuery(makeProject(), "no-match")).toBe(false);
  });
});
