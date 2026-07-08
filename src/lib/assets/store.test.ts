// src/lib/assets/store.test.ts
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { createInMemoryDb } from "@/lib/db";
import { createRun } from "@/lib/pipeline/runs";
import {
  AssetInUseError,
  DuplicateAssetError,
  createRepoAsset,
  createServerAsset,
  deleteAsset,
  getAsset,
  listAssets,
} from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("createRepoAsset", () => {
  it("creates a repo asset unassigned to any project by default", () => {
    const asset = createRepoAsset(
      { displayName: "nh-pay-gateway", repoUrl: "https://github.com/nh/pay.git" },
      db,
    );
    expect(asset.type).toBe("repo");
    expect(asset.projectId).toBeNull();
  });

  it("rejects a duplicate repo URL after normalization", () => {
    createRepoAsset({ displayName: "a", repoUrl: "https://github.com/nh/pay.git" }, db);
    expect(() =>
      createRepoAsset({ displayName: "b", repoUrl: "https://github.com/nh/pay/" }, db),
    ).toThrow(DuplicateAssetError);
  });
});

describe("createServerAsset", () => {
  it("encrypts the secret before storing", () => {
    const asset = createServerAsset(
      {
        displayName: "web-01", hostIp: "10.0.0.5", hostname: "web-01.internal",
        sshPort: 22, authType: "password", username: "admin", secret: "plaintext-password",
      },
      db,
    );
    expect(asset.encryptedSecret).not.toBe("plaintext-password");
    expect(asset.encryptedSecret).toContain(":");
  });

  it("rejects a duplicate host_ip + ssh_port combination", () => {
    createServerAsset(
      { displayName: "a", hostIp: "10.0.0.5", hostname: "a", sshPort: 22, authType: "password", username: "admin", secret: "x" },
      db,
    );
    expect(() =>
      createServerAsset(
        { displayName: "b", hostIp: "10.0.0.5", hostname: "b", sshPort: 22, authType: "password", username: "admin", secret: "y" },
        db,
      ),
    ).toThrow(DuplicateAssetError);
  });
});

describe("listAssets", () => {
  it("filters by type and unassigned project", () => {
    createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    createRepoAsset({ displayName: "b", repoUrl: "https://github.com/x/b" }, db);
    expect(listAssets({ type: "repo" }, db)).toHaveLength(2);
    expect(listAssets({ projectId: null }, db)).toHaveLength(2);
  });
});

describe("deleteAsset", () => {
  it("hard-deletes an asset with no running runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    deleteAsset(asset.id, db);
    expect(getAsset(asset.id, db)).toBeUndefined();
  });

  it("blocks deletion when a run is still running", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun(asset.repoUrl!, "git", null, db);
    db.prepare(`UPDATE runs SET asset_id = ?, status = 'running' WHERE id = ?`).run(asset.id, run.id);
    expect(() => deleteAsset(asset.id, db)).toThrow(AssetInUseError);
  });

  it("cascades run deletion when the asset had completed runs", () => {
    const asset = createRepoAsset({ displayName: "a", repoUrl: "https://github.com/x/a" }, db);
    const run = createRun(asset.repoUrl!, "git", null, db);
    db.prepare(`UPDATE runs SET asset_id = ?, status = 'done' WHERE id = ?`).run(asset.id, run.id);
    deleteAsset(asset.id, db);
    expect(db.prepare(`SELECT * FROM runs WHERE id = ?`).get(run.id)).toBeUndefined();
  });
});
