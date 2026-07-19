import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import type { Asset } from "@/lib/assets/types";
import { buildScanExtraVars } from "./scanInputsExtraVars";

beforeEach(() => {
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

function serverAsset(over: Partial<Asset>): Asset {
  return {
    id: "a1", type: "server", projectId: null, displayName: "db1", repoUrl: null,
    hostIp: "10.0.0.1", hostname: "db1", sshPort: 22, authType: "password", username: "root",
    encryptedSecret: null, os: null, owner: null, category: "DB", vendor: "Tibero",
    dockerfilePath: null, scanInputs: null, createdAt: "2026-07-19T00:00:00Z", ...over,
  };
}

describe("buildScanExtraVars", () => {
  it("returns {} when the asset has no scan inputs", () => {
    expect(buildScanExtraVars(serverAsset({}))).toEqual({});
  });

  it("returns {} for a vendor without a pack", () => {
    expect(buildScanExtraVars(serverAsset({ vendor: "없는벤더", scanInputs: '{"x":"y"}' }))).toEqual({});
  });

  it("filters out rogue keys not in vendor specs (allowlist only declared names)", () => {
    // Create a scanInputs JSON with both a valid tibero field and a rogue ansible_ssh_pass key.
    // Both are plaintext (non-secret) so they won't be encrypted.
    const scanInputsJson = JSON.stringify({
      tibero_home: "/home/tibero/tibero7",
      tibero_tbsid: "tibero",
      ansible_ssh_pass: "rogue_password",
    });
    const result = buildScanExtraVars(serverAsset({ scanInputs: scanInputsJson }));

    // Assert that only declared tibero_* keys are in the result, not the rogue ansible_ssh_pass
    expect(result).toHaveProperty("tibero_home");
    expect(result).toHaveProperty("tibero_tbsid");
    expect(result).not.toHaveProperty("ansible_ssh_pass");
    expect(Object.keys(result).sort()).toEqual(["tibero_home", "tibero_tbsid"]);
  });

  // 티베로 팩 등록 후 실제 복호화 병합은 Task 8 통합에서 검증.
});
