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

  // fail-closed 회귀: secure만 있고 http-only가 없는 쿠키는 pass가 아니라 fail이어야 한다.
  it("JE-07 fails when cookie has secure but not http-only", () => {
    const dom = `<domain><session-config><cookie secure="true"/></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-07")!.status).toBe("fail");
  });

  // fail-open 회귀: 쿠키가 아닌 무관한 요소(SSL 리스너)에 secure/http-only가 있어도
  // session-config 밖이므로 JE-07은 fail이어야 한다(문서 전역 매치로 pass 오판 금지).
  it("JE-07 fails when secure/http-only appear only outside session-config", () => {
    const dom = `<domain><listener><ssl secure="true" http-only="true"/></listener><session-config><cookie/></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-07")!.status).toBe("fail");
  });

  it("JE-07 reviews when domain.xml has no session-config", () => {
    const dom = `<domain><listener><port>8080</port></listener></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-07")!.status).toBe("review");
  });

  // fail-closed: 리스너 정보가 전혀 없으면 SSL 사용 여부를 단정할 수 없으므로 review.
  it("JE-08 reviews when domain.xml has no listener info", () => {
    const dom = `<domain><session-config><timeout>10</timeout></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-08")!.status).toBe("review");
  });

  // fail-open 회귀: <ssl>이 listener 밖에만 있으면 SSL 리스너로 인정하지 않는다(해당 리스너는 평문).
  it("JE-08 fails when <ssl> appears only outside any listener block", () => {
    const dom = `<domain><ssl-config/><listener><port>8080</port></listener></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-08")!.status).toBe("fail");
  });

  // fail-closed: accounts.xml은 있으나 비밀번호 항목이 없으면 JE-02/03은 pass가 아니라 review.
  it("JE-02/JE-03 review when accounts.xml has no parseable password", () => {
    const acc = `<accounts><user><name>svcadmin</name></user></accounts>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": acc }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-02")!.status).toBe("review");
    expect(r.find((x) => x.id === "JE-03")!.status).toBe("review");
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
