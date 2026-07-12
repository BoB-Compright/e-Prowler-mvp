import { describe, expect, it } from "vitest";
import { TOMCAT_EVIDENCE, getTomcatState, noGroupOtherWrite, evaluateWAS01, evaluateWAS02, evaluateWAS03, evaluateWAS04, evaluateWAS05, evaluateWAS06, evaluateWAS07, evaluateWAS08, evaluateWAS09, evaluateWAS10, evaluateWAS11, evaluateWAS12 } from "./wasTomcat";

const present = [
  { taskName: "tomcat detection (internal)", stdout: "present:/opt/tomcat\n" },
  { taskName: "tomcat webapps listing", stdout: "ROOT\nmanager\nexamples\n" },
  { taskName: "tomcat server.xml", stdout: '<Server port="8005" shutdown="SHUTDOWN">' },
];

describe("tomcat evidence + state", () => {
  it("declares 8 unique evidence tasks", () => {
    const names = TOMCAT_EVIDENCE.map((t) => t.name);
    expect(names).toContain("tomcat detection (internal)");
    expect(names).toContain("tomcat server.xml");
    expect(new Set(names).size).toBe(names.length);
    expect(TOMCAT_EVIDENCE.length).toBe(8);
  });
  it("parses present + webapps list", () => {
    const s = getTomcatState(present);
    expect(s.present).toBe(true);
    expect(s.webapps).toEqual(["ROOT", "manager", "examples"]);
    expect(s.serverXml).toContain("SHUTDOWN");
  });
  it("absent detection", () => {
    expect(getTomcatState([{ taskName: "tomcat detection (internal)", stdout: "absent" }]).present).toBe(false);
  });
  it("noGroupOtherWrite: 750 ok, 777 fail", () => {
    expect(noGroupOtherWrite("root:tomcat 750")).toBe(true);
    expect(noGroupOtherWrite("root:root 777")).toBe(false);
  });
});

const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const base = (extra: { taskName: string; stdout: string }[]) => [t("tomcat detection (internal)", "present:/opt/tomcat"), ...extra];

it("WAS-01 sample apps present → fail, none → pass", () => {
  expect(evaluateWAS01(base([t("tomcat webapps listing", "ROOT\nmanager\nexamples")])).status).toBe("fail");
  expect(evaluateWAS01(base([t("tomcat webapps listing", "ROOT\nmyapp")])).status).toBe("pass");
});
it("WAS-02 shutdown -1 or non-default → pass, default → fail", () => {
  expect(evaluateWAS02(base([t("tomcat server.xml", '<Server port="-1" shutdown="SHUTDOWN">')])).status).toBe("pass");
  expect(evaluateWAS02(base([t("tomcat server.xml", '<Server port="8005" shutdown="XYZ">')])).status).toBe("pass");
  expect(evaluateWAS02(base([t("tomcat server.xml", '<Server port="8005" shutdown="SHUTDOWN">')])).status).toBe("fail");
});
it("WAS-03 non-root user → pass, root → fail", () => {
  expect(evaluateWAS03(base([t("tomcat process user", "tomcat   /usr/bin/java ... org.apache.catalina.startup.Bootstrap")])).status).toBe("pass");
  expect(evaluateWAS03(base([t("tomcat process user", "root   /usr/bin/java ... catalina")])).status).toBe("fail");
});
it("WAS-04 conf perms 750 → pass, 777 → fail", () => {
  expect(evaluateWAS04(base([t("tomcat conf perms", "root:tomcat 750")])).status).toBe("pass");
  expect(evaluateWAS04(base([t("tomcat conf perms", "root:root 777")])).status).toBe("fail");
});
it("WAS-05 active manager role/user → fail, all commented → pass", () => {
  expect(evaluateWAS05(base([t("tomcat-users.xml", '<tomcat-users><user username="admin" password="s3cret" roles="manager-gui"/></tomcat-users>')])).status).toBe("fail");
  expect(evaluateWAS05(base([t("tomcat-users.xml", "<tomcat-users>\n<!-- <user username=\"admin\" .../> -->\n</tomcat-users>")])).status).toBe("pass");
});
it("WAS-06 active AJP connector → fail, none → pass", () => {
  expect(evaluateWAS06(base([t("tomcat server.xml", '<Connector protocol="AJP/1.3" port="8009" />')])).status).toBe("fail");
  expect(evaluateWAS06(base([t("tomcat server.xml", '<Connector protocol="HTTP/1.1" port="8080" />')])).status).toBe("pass");
});
it("WAS-07 autoDeploy true → fail, false → pass", () => {
  expect(evaluateWAS07(base([t("tomcat server.xml", '<Host name="localhost" autoDeploy="true">')])).status).toBe("fail");
  expect(evaluateWAS07(base([t("tomcat server.xml", '<Host name="localhost" autoDeploy="false" deployOnStartup="false">')])).status).toBe("pass");
});
it("WAS-08 xpoweredBy true → fail, server attr set → pass", () => {
  expect(evaluateWAS08(base([t("tomcat server.xml", '<Connector port="8080" xpoweredBy="true" />')])).status).toBe("fail");
  expect(evaluateWAS08(base([t("tomcat server.xml", '<Connector port="8080" server="WebServer" />')])).status).toBe("pass");
});
it("WAS-09 AccessLogValve present → pass, absent → fail", () => {
  expect(evaluateWAS09(base([t("tomcat server.xml", '<Valve className="org.apache.catalina.valves.AccessLogValve" />')])).status).toBe("pass");
  expect(evaluateWAS09(base([t("tomcat server.xml", "<Engine/>")])).status).toBe("fail");
});
it("WAS-10 allowTrace true → fail, absent → pass", () => {
  expect(evaluateWAS10(base([t("tomcat server.xml", '<Connector port="8080" allowTrace="true" />')])).status).toBe("fail");
  expect(evaluateWAS10(base([t("tomcat server.xml", '<Connector port="8080" />')])).status).toBe("pass");
});
it("WAS-11 version>=10 → pass; <10 with -security → pass; <10 without → fail", () => {
  expect(evaluateWAS11(base([t("tomcat version", "Server version: Apache Tomcat/10.1.7")])).status).toBe("pass");
  expect(evaluateWAS11(base([t("tomcat version", "Apache Tomcat Version 9.0.71"), t("tomcat process user", "tomcat java -security org...")])).status).toBe("pass");
  expect(evaluateWAS11(base([t("tomcat version", "Apache Tomcat Version 9.0.71"), t("tomcat process user", "tomcat java org...")])).status).toBe("fail");
});
it("WAS-12 → review with version evidence", () => {
  const r = evaluateWAS12(base([t("tomcat version", "Server version: Apache Tomcat/9.0.71")]));
  expect(r.status).toBe("review");
  expect(r.evidence).toContain("9.0.71");
});
it("WAS-12 shows 확인 불가 for __MISSING__ version", () => {
  const r = evaluateWAS12(base([t("tomcat version", "__MISSING__")]));
  expect(r.evidence).toContain("확인 불가");
  expect(r.evidence).not.toContain("__MISSING__");
});
