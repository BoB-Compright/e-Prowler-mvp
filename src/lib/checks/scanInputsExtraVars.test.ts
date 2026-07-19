import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/assets/types";
import { buildScanExtraVars } from "./scanInputsExtraVars";

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
  // 티베로 팩 등록 후 실제 복호화 병합은 Task 8 통합에서 검증.
});
