import { describe, expect, it } from "vitest";
import { webtobPack } from "./webWebtob";

const PROVIDED = new Set(["webtob_dir"]);
function tasks(map: Record<string, string>) {
  return Object.entries(map).map(([taskName, stdout]) => ({ taskName, stdout }));
}

describe("webtobPack", () => {
  it("declares webtob_dir(path), no secret", () => {
    expect(webtobPack.requiredInputs!.map((s) => s.name)).toEqual(["webtob_dir"]);
    expect(webtobPack.requiredInputs![0].kind).toBe("path");
  });

  it("WT-01 fails when Options contains INDEX (directory listing)", () => {
    const httpm = `*NODE\nDocroot = "/home/webtob/docs"\nOptions = "INDEX"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-01")!.status).toBe("fail");
  });

  it("WT-01 passes when Options has no INDEX", () => {
    const httpm = `*NODE\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-01")!.status).toBe("pass");
  });

  it("WT-01 fail-open regression: INDEX token appears elsewhere but Options directive itself is safe", () => {
    const httpm = `*NODE\n# Options = "INDEX" (legacy, disabled below)\nDocroot = "/home/webtob/INDEX_BACKUP"\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-01")!.status).toBe("pass");
  });

  it("WT-03 fails when dangerous methods are allowed", () => {
    const httpm = `*NODE\nMethod = "GET,POST,PUT,DELETE"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-03")!.status).toBe("fail");
  });

  it("WT-03 passes when only GET/POST/HEAD allowed", () => {
    const httpm = `*NODE\nMethod = "GET,POST,HEAD"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-03")!.status).toBe("pass");
  });

  it("WT-03 reviews when Method directive is absent", () => {
    const httpm = `*NODE\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-03")!.status).toBe("review");
  });

  it("WT-02 fails on group/other-writable http.m", () => {
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m perms": "webtob:webtob 666" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-02")!.status).toBe("fail");
  });

  it("WT-02 passes on owner-only http.m perms", () => {
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m perms": "webtob:webtob 640" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-02")!.status).toBe("pass");
  });

  it("WT-02 reviews on malformed perms output (fail-closed)", () => {
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m perms": "not-a-valid-stat-line" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-02")!.status).toBe("review");
  });

  it("WT-04 reviews when ErrorDocument is absent", () => {
    const httpm = `*NODE\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-04")!.status).toBe("review");
  });

  it("WT-04 passes when ErrorDocument is set", () => {
    const httpm = `*NODE\nErrorDocument = "404 /error/404.html"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-04")!.status).toBe("pass");
  });

  it("WT-05 fails when no SSL section present", () => {
    const httpm = `*NODE\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-05")!.status).toBe("fail");
  });

  it("WT-05 passes when *SSL section present", () => {
    const httpm = `*NODE\n*SSL\nSSLFlag = "SSL_ON"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-05")!.status).toBe("pass");
  });

  // fail-open 회귀: "443"이 무관한 값(Timeout 등)으로 등장해도 SSL 설정으로 오판하지 않는다.
  it("WT-05 fails when 443 appears only as an unrelated value (no SSL config)", () => {
    const httpm = `*NODE\nTimeout = "443"\nMaxUser = "443"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-05")!.status).toBe("fail");
  });

  // fail-open 회귀: SSLFlag가 명시적으로 꺼짐(SSL_OFF)이면 존재해도 fail이어야 한다.
  it("WT-05 fails when SSLFlag is explicitly off", () => {
    const httpm = `*NODE\nSSLFlag = "SSL_OFF"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-05")!.status).toBe("fail");
  });

  it("WT-06 reviews when no logging section present", () => {
    const httpm = `*NODE\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-06")!.status).toBe("review");
  });

  it("WT-06 passes when *LOGGING section present", () => {
    const httpm = `*NODE\n*LOGGING\nLogdir = "/home/webtob/logs"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-06")!.status).toBe("pass");
  });

  it("WT-07 reviews when no request-limit directive present", () => {
    const httpm = `*NODE\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-07")!.status).toBe("review");
  });

  it("WT-07 passes when Timeout directive present", () => {
    const httpm = `*NODE\nTimeout = "60"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-07")!.status).toBe("pass");
  });

  it("WT-08 fails when FollowSymLinks allowed via Options", () => {
    const httpm = `*NODE\nOptions = "FollowSymLinks"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-08")!.status).toBe("fail");
  });

  it("WT-08 passes when Options has no symlink/parent-path directive", () => {
    const httpm = `*NODE\nOptions = "None"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-08")!.status).toBe("pass");
  });

  it("WT-09 reviews when admin listener has no access restriction", () => {
    const httpm = `*NODE\n*ADMIN\nAdmin_ip = "0.0.0.0"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-09")!.status).toBe("review");
  });

  // fail-closed: *ADMIN 섹션이 없으면 http.m만으로 wsadmin 접근제어를 단정할 수 없어 review.
  it("WT-09 reviews when no admin section present", () => {
    const httpm = `*NODE\nOptions = "None"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-09")!.status).toBe("review");
  });

  it("WT-09 passes when admin listener is IP-restricted", () => {
    const httpm = `*NODE\n*ADMIN\nAdmin_ip = "10.0.0.5"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-09")!.status).toBe("pass");
  });

  // fail-open 회귀: Admin_ip가 빈 값이면 "설정됨"이 아니라 review여야 한다.
  it("WT-09 reviews when Admin_ip is present but empty", () => {
    const httpm = `*NODE\n*ADMIN\nAdmin_ip = ""\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-09")!.status).toBe("review");
  });

  // fail-open 회귀: 목록에 0.0.0.0이 토큰으로 섞여 있으면 전체 개방으로 보고 review.
  it("WT-09 reviews when Admin_ip list contains 0.0.0.0", () => {
    const httpm = `*NODE\n*ADMIN\nAdmin_ip = "10.0.0.5,0.0.0.0"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-09")!.status).toBe("review");
  });

  it("reviews when input missing or file missing", () => {
    expect(webtobPack.evaluate({ findings: null, tasks: [], inputsProvided: new Set() }).find((x) => x.id === "WT-01")!.status).toBe("review");
    expect(webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": "__MISSING__" }), inputsProvided: PROVIDED }).find((x) => x.id === "WT-01")!.status).toBe("review");
  });

  it("returns results in WT-01..WT-09 order", () => {
    const r = webtobPack.evaluate({ findings: null, tasks: [], inputsProvided: new Set() });
    expect(r.map((x) => x.id)).toEqual(["WT-01", "WT-02", "WT-03", "WT-04", "WT-05", "WT-06", "WT-07", "WT-08", "WT-09"]);
  });
});
