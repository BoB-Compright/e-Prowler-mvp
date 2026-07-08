import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/assets/types";
import { encryptSecret } from "@/lib/crypto/secretCipher";
import { collectInstalledPackages, type PackageCollectorDeps } from "./packageCollector";

function serverAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1", type: "server", projectId: null, displayName: "web-01",
    repoUrl: null, hostIp: "10.0.0.5", hostname: "web-01", sshPort: 22,
    authType: "password", username: "admin", encryptedSecret: encryptSecret("pw"), createdAt: "now",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("collectInstalledPackages", () => {
  it("parses ansible ad-hoc shell output into name/version pairs", async () => {
    const asset = serverAsset({ authType: "password", encryptedSecret: encryptSecret("pw") });
    const deps: PackageCollectorDeps = {
      execFile: vi.fn().mockResolvedValue({
        stdout: "10.0.0.5 | CHANGED | rc=0 >>\nopenssl 1.1.1f-1ubuntu2.16\ncurl 7.68.0-1ubuntu2.18\n",
        stderr: "",
      }),
    };

    const packages = await collectInstalledPackages(asset, deps);

    expect(packages).toEqual([
      { name: "openssl", version: "1.1.1f-1ubuntu2.16" },
      { name: "curl", version: "7.68.0-1ubuntu2.18" },
    ]);
  });

  it("returns an empty list when the shell command produces no package lines", async () => {
    const asset = serverAsset();
    const deps: PackageCollectorDeps = {
      execFile: vi.fn().mockResolvedValue({ stdout: "10.0.0.5 | CHANGED | rc=0 >>\n\n", stderr: "" }),
    };

    expect(await collectInstalledPackages(asset, deps)).toEqual([]);
  });

  it("wraps a key-auth run in a temp key file and passes --private-key", async () => {
    const asset = serverAsset({ authType: "key", encryptedSecret: encryptSecret("-----KEY-----") });
    const deps: PackageCollectorDeps = {
      execFile: vi.fn().mockResolvedValue({ stdout: "h | CHANGED | rc=0 >>\nopenssl 1.1.1f\n", stderr: "" }),
    };

    const packages = await collectInstalledPackages(asset, deps);

    expect(packages).toEqual([{ name: "openssl", version: "1.1.1f" }]);
    const call = (deps.execFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toContain("--private-key");
  });
});
