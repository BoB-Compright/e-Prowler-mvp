import { describe, expect, it } from "vitest";
import {
  ASSET_KIND_LABEL,
  categoryToKind,
  inferAssetKindFromName,
  classifyAssetKind,
  detectKindFromResults,
} from "./kind";
import type { Asset } from "./types";

function asset(over: Partial<Asset>): Asset {
  return {
    id: "a1", type: "repo", projectId: null, displayName: "", repoUrl: null, hostIp: null,
    hostname: null, sshPort: null, authType: null, username: null, encryptedSecret: null,
    os: null, owner: null, category: null, vendor: null, dockerfilePath: null, createdAt: "",
    ...over,
  } as Asset;
}

describe("ASSET_KIND_LABEL", () => {
  it("5종 라벨", () => {
    expect(ASSET_KIND_LABEL).toEqual({ os: "OS", web: "WEB", was: "WAS", db: "DB", other: "기타" });
  });
});

describe("categoryToKind", () => {
  it.each([
    ["OS", "os"], ["WEB", "web"], ["WAS", "was"], ["DB", "db"],
    [null, "other"], ["기타", "other"], ["nonsense", "other"],
  ])("%s → %s", (cat, kind) => {
    expect(categoryToKind(cat as string | null)).toBe(kind);
  });
});

describe("inferAssetKindFromName", () => {
  it.each([
    ["nhit-image/tomcat-9.0-jre25/Dockerfile", "was"],
    ["nhit-image/python-3.12.13-trixie/Dockerfile", "other"], // 런타임(python)이 OS(trixie)보다 우선
    ["nhit-image/debian-stable-slim/Dockerfile", "os"],
    ["nginx:1.27", "web"],
    ["httpd:2.4", "web"],
    ["mysql:8", "db"],
    ["postgres:16-alpine", "db"], // DB(postgres)가 OS(alpine)보다 우선
    ["redis:7", "db"],
    ["openjdk:21", "other"], // 런타임
    ["ubuntu:24.04", "os"],
    ["", "other"],
    ["some-unknown-thing", "other"],
    ["oraclelinux:9", "os"],
    ["nhit-image/oraclelinux-8-slim/Dockerfile", "os"],
    ["oracle:19", "db"],
  ])("%s → %s", (name, kind) => {
    expect(inferAssetKindFromName(name)).toBe(kind);
  });
});

describe("classifyAssetKind", () => {
  it("서버는 선언 category 사용", () => {
    expect(classifyAssetKind(asset({ type: "server", category: "WAS" }))).toBe("was");
    expect(classifyAssetKind(asset({ type: "server", category: null }))).toBe("other");
  });
  it("레포는 category 있으면 그걸(스캔 보정값)", () => {
    expect(classifyAssetKind(asset({ type: "repo", category: "DB", displayName: "tomcat-x" }))).toBe("db");
  });
  it("레포는 category 없으면 이름 추론(displayName→repoUrl→dockerfilePath)", () => {
    expect(classifyAssetKind(asset({ type: "repo", displayName: "tomcat-9" }))).toBe("was");
    expect(classifyAssetKind(asset({ type: "repo", displayName: "", repoUrl: "x/nginx/Dockerfile" }))).toBe("web");
  });
});

describe("detectKindFromResults", () => {
  it("WAS non-skip 있으면 WAS 우선", () => {
    expect(detectKindFromResults([
      { id: "WAS-01", status: "pass" }, { id: "WEB-01", status: "fail" }, { id: "U-01", status: "pass" },
    ])).toBe("WAS");
  });
  it("WAS 없고 WEB 있으면 WEB", () => {
    expect(detectKindFromResults([{ id: "WEB-01", status: "review" }, { id: "U-01", status: "pass" }])).toBe("WEB");
  });
  it("DB 단독", () => {
    expect(detectKindFromResults([{ id: "DB-01", status: "pass" }])).toBe("DB");
  });
  it("unix만 있으면 OS", () => {
    expect(detectKindFromResults([{ id: "U-01", status: "pass" }])).toBe("OS");
  });
  it("전부 skip이면 null", () => {
    expect(detectKindFromResults([{ id: "WEB-01", status: "skip" }, { id: "U-01", status: "skip" }])).toBeNull();
  });
  it("container(C-*)만 있으면 null(변별력 없음)", () => {
    expect(detectKindFromResults([{ id: "C-01", status: "pass" }])).toBeNull();
  });
});
