import { describe, expect, it } from "vitest";
import { evaluateC01, evaluateC02, evaluateU16 } from "./ruleEvaluation";
import type { AnsibleTaskOutput } from "./ansibleRunner";

function task(taskName: string, stdout: string): AnsibleTaskOutput {
  return { taskName, stdout };
}

describe("evaluateC01", () => {
  it("passes when USER is set and runtime uid is non-zero", () => {
    const result = evaluateC01(
      { hasUserInstruction: true, hardcodedSecretVars: [] },
      [task("C-01: runtime uid", "1000\n")],
    );
    expect(result).toMatchObject({ id: "C-01", status: "pass" });
  });

  it("fails when USER is missing even if uid happens to be non-zero", () => {
    const result = evaluateC01(
      { hasUserInstruction: false, hardcodedSecretVars: [] },
      [task("C-01: runtime uid", "1000\n")],
    );
    expect(result.status).toBe("fail");
  });

  it("fails when runtime uid is 0 even if USER is set", () => {
    const result = evaluateC01(
      { hasUserInstruction: true, hardcodedSecretVars: [] },
      [task("C-01: runtime uid", "0\n")],
    );
    expect(result.status).toBe("fail");
  });
});

describe("evaluateC02", () => {
  it("passes with no hardcoded secret vars", () => {
    expect(evaluateC02({ hasUserInstruction: true, hardcodedSecretVars: [] }).status).toBe("pass");
  });

  it("fails and lists variable names (never values) when secrets are found", () => {
    const result = evaluateC02({
      hasUserInstruction: true,
      hardcodedSecretVars: ["DB_PASSWORD", "API_KEY"],
    });
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("DB_PASSWORD");
    expect(result.evidence).toContain("API_KEY");
  });
});

describe("evaluateU16", () => {
  it("passes for root:root 644", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "root:root 644\n")]);
    expect(result.status).toBe("pass");
  });

  it("fails when group/other has write permission", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "root:root 666\n")]);
    expect(result.status).toBe("fail");
  });

  it("fails when not owned by root:root", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "appuser:appuser 644\n")]);
    expect(result.status).toBe("fail");
  });

  it("skips when /etc/passwd does not exist in the container", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "__MISSING__\n")]);
    expect(result.status).toBe("skip");
  });
});
