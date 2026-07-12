import { describe, expect, it } from "vitest";
import { TOMCAT_EVIDENCE, getTomcatState, noGroupOtherWrite } from "./wasTomcat";

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
