import { describe, expect, it } from "vitest";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import { tiberoPack } from "./dbTibero";

function task(name: string, stdout: string): AnsibleTaskOutput {
  return { taskName: name, stdout };
}
const MISSING = "__MISSING__";

describe("tiberoPack", () => {
  it("declares the five required inputs incl. secret password", () => {
    const names = tiberoPack.requiredInputs!.map((s) => s.name);
    expect(names).toEqual(["tibero_home", "tibero_tbsid", "tibero_db_user", "tibero_db_pass", "tibero_listener_port"]);
    expect(tiberoPack.requiredInputs!.find((s) => s.name === "tibero_db_pass")!.kind).toBe("secret");
  });

  it("TB-13 fails when .tip has no IP access control", () => {
    const tasks = [task("TB-13: tibero tip content", "LISTENER_PORT=8629\nMAX_SESSION_COUNT=100\n")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    const tb13 = r.find((x) => x.id === "TB-13")!;
    expect(tb13.status).toBe("fail");
  });

  it("TB-13 passes when LSNR_INVITED_IP is set", () => {
    const tasks = [task("TB-13: tibero tip content", "LSNR_INVITED_IP=192.168.1.0/24\n")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-13")!.status).toBe("pass");
  });

  it("TB-14 fails when .tip perms are group/other-writable", () => {
    const tasks = [task("TB-14: tibero tip perms", "tibero:tibero 666")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-14")!.status).toBe("fail");
  });

  it("TB-14 passes for 600 perms owned by tibero", () => {
    const tasks = [task("TB-14: tibero tip perms", "tibero:tibero 600")];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set(["tibero_home", "tibero_tbsid"]) });
    expect(r.find((x) => x.id === "TB-14")!.status).toBe("pass");
  });

  it("reviews when required path inputs are missing", () => {
    const tasks = [task("TB-13: tibero tip content", MISSING)];
    const r = tiberoPack.evaluate({ findings: null, tasks, inputsProvided: new Set() });
    expect(r.find((x) => x.id === "TB-13")!.status).toBe("review");
  });
});
