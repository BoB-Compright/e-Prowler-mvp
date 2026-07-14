import { describe, expect, it } from "vitest";
import { resolveCheckPlan, evaluatePack, evaluatePlan, filterPlanByCategories } from "./resolve";
import type { Asset } from "@/lib/assets/types";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { VendorPack } from "./types";

function repoAsset(over: Partial<Asset> = {}): Asset {
  // 최소 필드 — resolveCheckPlan은 type/category/vendor만 본다.
  return { id: "a1", type: "repo", displayName: "img", category: null, vendor: null, ...(over as object) } as Asset;
}
function serverAsset(over: Partial<Asset> = {}): Asset {
  return { id: "s1", type: "server", displayName: "srv", category: null, vendor: null, ...(over as object) } as Asset;
}

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
  it("server + DB/MySQL → os-unix + db-mysql with mysql evidence", () => {
    const asset = { ...base, type: "server", category: "DB", vendor: "MySQL" } as Asset;
    const plan = resolveCheckPlan(asset);
    expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "db-mysql"]);
    expect(plan.evidenceTasks.some((t) => t.name === "mysql detection (internal)")).toBe(true);
  });
  it("server + DB/PostgreSQL → os-unix + db-postgresql with postgres evidence", () => {
    const asset = { ...base, type: "server", category: "DB", vendor: "PostgreSQL" } as Asset;
    const plan = resolveCheckPlan(asset);
    expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "db-postgresql"]);
    expect(plan.evidenceTasks.some((t) => t.name === "postgres detection (internal)")).toBe(true);
  });
  it("server + DB/Oracle → os-unix + db-oracle with oracle evidence", () => {
    const asset = { ...base, type: "server", category: "DB", vendor: "Oracle" } as Asset;
    const plan = resolveCheckPlan(asset);
    expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "db-oracle"]);
    expect(plan.evidenceTasks.some((t) => t.name === "oracle detection (internal)")).toBe(true);
  });
  it("server + OS/Ubuntu → os-unix only", () => {
    const asset = { ...base, type: "server", category: "OS", vendor: "Ubuntu" } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-unix"]);
  });
  it("server + OS/Windows Server → [os-windows] (not os-unix)", () => {
    const asset = { ...base, type: "server", category: "OS", vendor: "Windows Server" } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-windows"]);
  });
  it("Linux OS/Ubuntu still → [os-unix] (no regression)", () => {
    const asset = { ...base, type: "server", category: "OS", vendor: "Ubuntu" } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-unix"]);
  });
  it("server + WEB/IIS → [os-windows, web-iis]", () => {
    const asset = { ...base, type: "server", category: "WEB", vendor: "IIS" } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-windows", "web-iis"]);
  });
  it("server + DB/MSSQL → [os-windows, db-mssql]", () => {
    const asset = { ...base, type: "server", category: "DB", vendor: "MSSQL" } as Asset;
    expect(resolveCheckPlan(asset).packs.map((p) => p.id)).toEqual(["os-windows", "db-mssql"]);
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

describe("resolveCheckPlan — 이미지 autodetect", () => {
  it("비-server는 autodetect 모드 + container·os-unix·5개 벤더 팩", () => {
    const plan = resolveCheckPlan(repoAsset());
    expect(plan.mode).toBe("autodetect");
    const ids = plan.packs.map((p) => p.id).sort();
    expect(ids).toEqual(["container", "db-mysql", "db-postgresql", "os-unix", "was-tomcat", "web-apache", "web-nginx"].sort());
  });
  it("server는 declared 모드(회귀)", () => {
    const plan = resolveCheckPlan(serverAsset());
    expect(plan.mode ?? "declared").toBe("declared");
    expect(plan.packs.map((p) => p.id)).toContain("os-unix");
    expect(plan.packs.map((p) => p.id)).not.toContain("web-nginx"); // 선언 없으면 벤더 팩 없음
  });
});

describe("evaluatePlan — autodetect skip/eval", () => {
  // nginx 탐지 증거 + OS 증거는 있고, postgres 증거는 없음 → nginx 평가·postgres skip·U-* 평가
  function imgTasks(): AnsibleTaskOutput[] {
    return [
      { taskName: "os detection (internal)", stdout: 'NAME="Ubuntu"' },
      // nginx detect(getNginxState)는 "nginx detection (internal)" stdout === "present"를 본다.
      { taskName: "nginx detection (internal)", stdout: "present" },
    ];
  }
  it("OS 감지 시 U-*는 skip이 아님, 미탐지 벤더는 skip(review 아님)", () => {
    const plan = resolveCheckPlan(repoAsset());
    const results = evaluatePlan(plan, { findings: null, tasks: imgTasks() }, repoAsset());
    // U-* 최소 1건이 skip이 아니어야(OS 감지됨)
    expect(results.some((r) => r.id.startsWith("U-") && r.status !== "skip")).toBe(true);
    // postgres(PG-*) 미탐지 → 전부 skip, review 없음
    const pg = results.filter((r) => r.id.startsWith("PG-"));
    expect(pg.length).toBeGreaterThan(0);
    expect(pg.every((r) => r.status === "skip")).toBe(true);
    // VENDOR-NA 합성 항목은 autodetect에서 생기지 않음
    expect(results.some((r) => r.id === "VENDOR-NA")).toBe(false);
  });
  it("OS 미감지 시 U-*는 전부 skip", () => {
    const plan = resolveCheckPlan(repoAsset());
    const results = evaluatePlan(plan, { findings: null, tasks: [] }, repoAsset());
    const u = results.filter((r) => r.id.startsWith("U-"));
    expect(u.length).toBeGreaterThan(0);
    expect(u.every((r) => r.status === "skip")).toBe(true);
  });
  it("항목 id 중복이 없다 — WEB 카탈로그 공유(nginx/apache)에도 WEB-*가 1건씩만", () => {
    const plan = resolveCheckPlan(repoAsset());
    // nginx 탐지: web-nginx는 실판정, web-apache는 같은 WEB-*를 skip → dedupe로 1건만.
    const results = evaluatePlan(plan, { findings: null, tasks: imgTasks() }, repoAsset());
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // 중복 없음
    // WEB-*는 nginx 탐지로 실판정(skip 아님)이 남아야 함(apache skip에 밀리지 않음)
    const web = results.filter((r) => r.id.startsWith("WEB-"));
    expect(web.length).toBeGreaterThan(0);
    expect(web.some((r) => r.status !== "skip")).toBe(true);
  });
  it("둘 다 미탐지(neither)면 WEB-*는 skip 1건씩(중복 없음)", () => {
    const plan = resolveCheckPlan(repoAsset());
    const results = evaluatePlan(plan, { findings: null, tasks: [{ taskName: "os detection (internal)", stdout: "Linux" }] }, repoAsset());
    const web = results.filter((r) => r.id.startsWith("WEB-"));
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(web.length).toBeGreaterThan(0);
    expect(web.every((r) => r.status === "skip")).toBe(true);
  });
});

describe("filterPlanByCategories", () => {
  it("undefined/빈 배열이면 plan 그대로(no-op)", () => {
    const plan = resolveCheckPlan(repoAsset());
    expect(filterPlanByCategories(plan, undefined)).toBe(plan);
    expect(filterPlanByCategories(plan, [])).toBe(plan);
  });
  it("선택 카테고리의 팩만 남기고 evidenceTasks 재계산·mode 보존", () => {
    const plan = resolveCheckPlan(repoAsset()); // autodetect: container·OS·WEB·WAS·DB
    const filtered = filterPlanByCategories(plan, ["DB"]);
    expect(filtered.packs.every((p) => p.category === "DB")).toBe(true);
    expect(filtered.packs.length).toBeGreaterThan(0);
    expect(filtered.mode).toBe(plan.mode);
    // evidenceTasks가 남은 팩 기준(전체보다 같거나 적음)
    expect(filtered.evidenceTasks.length).toBeLessThanOrEqual(plan.evidenceTasks.length);
  });
  it("여러 카테고리 선택 시 합집합", () => {
    const plan = resolveCheckPlan(repoAsset());
    const filtered = filterPlanByCategories(plan, ["OS", "DB"]);
    const cats = new Set(filtered.packs.map((p) => p.category));
    expect([...cats].sort()).toEqual(["DB", "OS"]);
  });
  it("매칭 0개면 전체 plan으로 폴백", () => {
    const plan = resolveCheckPlan(repoAsset());
    const filtered = filterPlanByCategories(plan, ["NONEXISTENT"]);
    expect(filtered).toBe(plan);
  });
});
