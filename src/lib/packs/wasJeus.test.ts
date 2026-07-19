import { describe, expect, it } from "vitest";
import { jeusPack } from "./wasJeus";

const PROVIDED = new Set(["jeus_home", "jeus_domain"]);
function tasks(map: Record<string, string>) {
  return Object.entries(map).map(([taskName, stdout]) => ({ taskName, stdout }));
}

describe("jeusPack", () => {
  it("declares jeus_home(path) and jeus_domain(text), no secret", () => {
    const names = jeusPack.requiredInputs!.map((s) => s.name);
    expect(names).toEqual(["jeus_home", "jeus_domain"]);
    expect(jeusPack.requiredInputs!.every((s) => s.kind !== "secret")).toBe(true);
  });

  it("JE-02 fails when admin password is plaintext (not {algo})", () => {
    const acc = `<accounts><user><name>administrator</name><password>tibero123</password></user></accounts>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": acc }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-02")!.status).toBe("fail");
    expect(r.find((x) => x.id === "JE-01")!.status).toBe("fail"); // administrator 계정 존재
  });

  it("JE-02 passes when password is {AES}-encrypted", () => {
    const acc = `<accounts><user><name>svcadmin</name><password>{AES}i06wYRz3Gqun2sKtXHIq</password></user></accounts>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": acc }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-02")!.status).toBe("pass");
    expect(r.find((x) => x.id === "JE-01")!.status).toBe("pass"); // administrator 없음
  });

  it("JE-04 fails when accounts.xml is group/other accessible", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml perms": "jeus:jeus 644" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-04")!.status).toBe("fail");
  });

  it("reviews when required inputs missing", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: [], inputsProvided: new Set() });
    for (const id of ["JE-01","JE-02","JE-08"]) expect(r.find((x) => x.id === id)!.status).toBe("review");
  });

  it("reviews an item when its config file is missing", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": "__MISSING__" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-02")!.status).toBe("review");
  });

  it("JE-09 fails when a datasource password is plaintext in domain.xml", () => {
    const dom = `<domain><data-source><password>plainpw</password></data-source><session-config><timeout>30</timeout></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-09")!.status).toBe("fail");
    expect(r.find((x) => x.id === "JE-06")!.status).toBe("pass"); // timeout=30 (<=30)
  });

  it("JE-09 passes when datasource password is encrypted", () => {
    const dom = `<domain><data-source><password>{AES}xyz</password></data-source></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-09")!.status).toBe("pass");
  });

  it("JE-09 reviews when domain.xml has no data-source at all", () => {
    const dom = `<domain><session-config><timeout>10</timeout></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-09")!.status).toBe("review");
  });

  it("JE-03 reviews when password uses a weak encryption algorithm (DES)", () => {
    const acc = `<accounts><user><name>svcadmin</name><password>{DES}abcd1234</password></user></accounts>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": acc }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-03")!.status).toBe("review");
  });

  it("JE-05 fails when security.key is group/other accessible", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: security.key perms": "jeus:jeus 640" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-05")!.status).toBe("fail");
  });

  it("JE-05 passes when security.key is owner-only (600)", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: security.key perms": "jeus:jeus 600" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-05")!.status).toBe("pass");
  });

  it("JE-04 passes when accounts.xml is owner-only (600)", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml perms": "jeus:jeus 600" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-04")!.status).toBe("pass");
  });

  it("JE-06 reviews when session timeout exceeds 30", () => {
    const dom = `<domain><session-config><timeout>60</timeout></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-06")!.status).toBe("review");
  });

  it("JE-07 fails when cookie has neither secure nor http-only", () => {
    const dom = `<domain><session-config><cookie/></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-07")!.status).toBe("fail");
  });

  it("JE-07 passes when cookie has secure and http-only", () => {
    const dom = `<domain><session-config><cookie secure="true" http-only="true"/></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-07")!.status).toBe("pass");
  });

  it("JE-08 fails when there is no ssl/https listener", () => {
    const dom = `<domain><listener><port>8809</port></listener></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-08")!.status).toBe("fail");
  });

  it("JE-08 passes when an ssl listener is configured", () => {
    const dom = `<domain><listener><ssl><port>8443</port></ssl></listener></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-08")!.status).toBe("pass");
  });

  it("JE-10 reviews when a sample app is deployed", () => {
    const dom = `<domain><deployed><name>examples</name></deployed></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-10")!.status).toBe("review");
  });

  it("JE-11 reviews when no access/audit logging is configured", () => {
    const dom = `<domain></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-11")!.status).toBe("review");
  });

  it("JE-11 passes when access-log is configured", () => {
    const dom = `<domain><access-log><enabled>true</enabled></access-log></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-11")!.status).toBe("pass");
  });

  it("JE-12 reviews when the admin listener is bound to 0.0.0.0", () => {
    const dom = `<domain><base-listener><ip>0.0.0.0</ip></base-listener></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-12")!.status).toBe("review");
  });

  it("JE-13 fails when show-stacktrace is true", () => {
    const dom = `<domain><show-stacktrace>true</show-stacktrace><error-page>/error</error-page></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-13")!.status).toBe("fail");
  });

  it("JE-13 fails when no custom error page is configured", () => {
    const dom = `<domain><show-stacktrace>false</show-stacktrace></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-13")!.status).toBe("fail");
  });

  it("JE-13 passes when stacktrace is off and a custom error page is configured", () => {
    const dom = `<domain><show-stacktrace>false</show-stacktrace><error-page>/error</error-page></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-13")!.status).toBe("pass");
  });

  it("reviews all JE-06..13 when domain.xml is missing", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": "__MISSING__" }), inputsProvided: PROVIDED });
    for (const id of ["JE-06","JE-07","JE-08","JE-09","JE-10","JE-11","JE-12","JE-13"]) {
      expect(r.find((x) => x.id === id)!.status).toBe("review");
    }
  });

  it("itemIds cover JE-01..JE-13 in order", () => {
    expect(jeusPack.itemIds).toEqual([
      "JE-01","JE-02","JE-03","JE-04","JE-05","JE-06","JE-07",
      "JE-08","JE-09","JE-10","JE-11","JE-12","JE-13",
    ]);
  });
});
