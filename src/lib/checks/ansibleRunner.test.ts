import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/assets/types";
import { encryptSecret } from "@/lib/crypto/secretCipher";
import { AuthFailureError, ConnectionFailureError } from "./retry";
import { buildServerRunPlan, classifyAnsibleError, findTaskOutput } from "./ansibleRunner";

describe("findTaskOutput", () => {
  it("matches a task by its catalog id prefix", () => {
    const tasks = [
      { taskName: "C-01: runtime uid", stdout: "0\n" },
      { taskName: "U-16: /etc/passwd owner and mode", stdout: "root:root 644\n" },
    ];
    expect(findTaskOutput(tasks, "C-01")?.stdout).toBe("0\n");
    expect(findTaskOutput(tasks, "U-16")?.stdout).toBe("root:root 644\n");
    expect(findTaskOutput(tasks, "C-02")).toBeUndefined();
  });
});

function server(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    type: "server",
    projectId: null,
    displayName: "web-01",
    repoUrl: null,
    hostIp: "10.0.0.5",
    hostname: "web-01",
    sshPort: 22,
    authType: "password",
    username: "admin",
    encryptedSecret: encryptSecret("pw"),
    createdAt: "now",
    ...overrides,
  };
}

describe("buildServerRunPlan", () => {
  it("decrypts the secret and marks password auth as needing no key file", () => {
    process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
    const asset = server({ authType: "password", encryptedSecret: encryptSecret("pw") });
    const plan = buildServerRunPlan(asset);
    expect(plan.needsKeyFile).toBe(false);
    expect(plan.decryptedSecret).toBe("pw");
  });

  it("marks key auth as needing a key file", () => {
    process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
    const asset = server({ authType: "key", encryptedSecret: encryptSecret("-----KEY-----") });
    const plan = buildServerRunPlan(asset);
    expect(plan.needsKeyFile).toBe(true);
    expect(plan.decryptedSecret).toBe("-----KEY-----");
  });
});

describe("classifyAnsibleError", () => {
  it("classifies a process-level timeout (execFile's `killed` shape) as a connection failure", () => {
    // This is what Node's execFile actually rejects with when its `timeout`
    // option expires — no "timed out" text anywhere in stderr/message.
    const err = Object.assign(new Error("Command failed: ansible-playbook -i 10.0.0.5, ..."), {
      killed: true,
      signal: "SIGTERM",
      stderr: "",
    });
    const classified = classifyAnsibleError(err);
    expect(classified).toBeInstanceOf(ConnectionFailureError);
    expect(classified.message).toBe("연결 실패");
  });

  it("classifies stderr auth failures as AuthFailureError with a fixed message", () => {
    const err = Object.assign(new Error("Command failed"), {
      stderr: "Permission denied (publickey,password).",
    });
    const classified = classifyAnsibleError(err);
    expect(classified).toBeInstanceOf(AuthFailureError);
    expect(classified.message).toBe("인증 실패");
  });

  it("classifies stderr connection failures as ConnectionFailureError", () => {
    const err = Object.assign(new Error("Command failed"), {
      stderr: "ssh: connect to host 10.0.0.5 port 22: Connection refused",
    });
    const classified = classifyAnsibleError(err);
    expect(classified).toBeInstanceOf(ConnectionFailureError);
  });

  it("leaves an unrecognized error as-is", () => {
    const err = new Error("stdout was not valid JSON");
    expect(classifyAnsibleError(err)).toBe(err);
  });
});
