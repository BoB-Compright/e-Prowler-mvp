import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/assets/types";
import { buildSshArgs } from "./sshCommand";

function serverAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    type: "server",
    projectId: null,
    displayName: "web-01",
    repoUrl: null,
    hostIp: "10.0.0.5",
    hostname: "web-01",
    sshPort: 2222,
    authType: "password",
    username: "admin",
    encryptedSecret: "enc",
    os: null,
    owner: null,
    dockerfilePath: null,
    createdAt: "now",
    ...overrides,
  };
}

describe("buildSshArgs", () => {
  it("passes the password via extra-vars, never in args", () => {
    const plan = buildSshArgs(serverAsset({ authType: "password" }), "s3cret", null);
    expect(plan.extraVars.ansible_ssh_pass).toBe("s3cret");
    expect(plan.args.join(" ")).not.toContain("s3cret");
    expect(plan.args.join(" ")).toContain("ansible_user=admin");
    expect(plan.args.join(" ")).toContain("ansible_port=2222");
  });

  it("uses --private-key for key auth and does not set ansible_ssh_pass", () => {
    const plan = buildSshArgs(serverAsset({ authType: "key" }), "-----KEY-----", "/tmp/key-abc");
    expect(plan.args).toContain("--private-key");
    expect(plan.args).toContain("/tmp/key-abc");
    expect(plan.extraVars.ansible_ssh_pass).toBeUndefined();
  });

  it("throws a Korean error when key auth is requested without a key file", () => {
    expect(() => buildSshArgs(serverAsset({ authType: "key" }), "-----KEY-----", null)).toThrow(
      "키 인증에는 keyFilePath가 필요합니다",
    );
  });
});
