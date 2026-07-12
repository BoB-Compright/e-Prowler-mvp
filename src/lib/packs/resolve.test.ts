import { describe, expect, it } from "vitest";
import { resolveCheckPlan, evaluatePack } from "./resolve";
import type { Asset } from "@/lib/assets/types";
import type { VendorPack } from "./types";

const base = {
  id: "a1", displayName: "x", projectId: null, os: null, owner: null,
  category: null, vendor: null, createdAt: "", encryptedSecret: null,
} as unknown as Asset;

describe("resolveCheckPlan", () => {
  it("server + WEB/Nginx → os-unix + web-nginx, nginx evidence included", () => {
    const asset = { ...base, type: "server", category: "WEB", vendor: "Nginx" } as Asset;
    const plan = resolveCheckPlan(asset);
    expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "web-nginx"]);
    expect(plan.evidenceTasks.some((t) => t.name === "nginx detection (internal)")).toBe(true);
  });
  it("server + WEB/Apache → os-unix + web-apache with apache evidence", () => {
    const asset = { ...base, type: "server", category: "WEB", vendor: "Apache" } as Asset;
    const plan = resolveCheckPlan(asset);
    expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "web-apache"]);
    expect(plan.evidenceTasks.some((t) => t.name === "apache detection (internal)")).toBe(true);
  });
  it("server + WAS/Tomcat → os-unix + was-tomcat with tomcat evidence", () => {
    const asset = { ...base, type: "server", category: "WAS", vendor: "Tomcat" } as Asset;
    const plan = resolveCheckPlan(asset);
    expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "was-tomcat"]);
    expect(plan.evidenceTasks.some((t) => t.name === "tomcat detection (internal)")).toBe(true);
  });
  it("server + OS/Ubuntu → os-unix only", () => {
    const asset = { ...base, type: "server", category: "OS", vendor: "Ubuntu" } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-unix"]);
  });
  it("repo asset → container baseline", () => {
    const asset = { ...base, type: "repo", category: null, vendor: null } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["container"]);
  });
});

describe("evaluatePack review rules", () => {
  const fakeVendorPack: VendorPack = {
    id: "web-x", category: "WEB", vendors: ["Xserver"], executionPath: "linux",
    itemIds: ["WEB-01", "WEB-02"], evidenceTasks: [],
    detect: () => false, evaluate: () => [{ id: "WEB-01", status: "pass", evidence: "" }],
  };
  it("declared-but-undetected vendor pack → every item review", () => {
    const results = evaluatePack(fakeVendorPack, { findings: null, tasks: [] });
    expect(results.map((r) => r.status)).toEqual(["review", "review"]);
    expect(results[0].evidence).toMatch(/Xserver 미확인/);
  });
  it("windows pack → every item review (host pending)", () => {
    const win = { ...fakeVendorPack, executionPath: "windows" as const, detect: () => true };
    const results = evaluatePack(win, { findings: null, tasks: [] });
    expect(results.every((r) => r.status === "review")).toBe(true);
    expect(results[0].evidence).toMatch(/Windows 호스트 연결 대기/);
  });
});
