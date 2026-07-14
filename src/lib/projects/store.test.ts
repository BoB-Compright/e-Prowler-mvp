import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset, getAsset } from "@/lib/assets/store";
import { createScanBatch } from "@/lib/pipeline/scanBatches";
import {
  ProjectNotFoundError,
  ShareLinkRevokedError,
  createProject,
  deleteProject,
  getProject,
  getShareLinkStatus,
  regenerateShareLink,
  revokeShareLink,
  setShareLinkEnabled,
  updateProject,
  verifyShareAccess,
} from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("createProject", () => {
  it("creates a project with a unique share token", () => {
    const a = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw1" }, db);
    const b = createProject({ name: "B", pmName: "이PM", pmEmail: "b@nh.com", sharePassword: "pw2" }, db);
    expect(a.shareToken).not.toBe(b.shareToken);
  });

  it("defaults the share link status to active", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    expect(project.shareStatus).toBe("active");
  });
});

describe("deleteProject", () => {
  it("moves owned assets to unclassified instead of deleting them", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const asset = createRepoAsset({ displayName: "x", repoUrl: "https://github.com/x/x", projectId: project.id }, db);
    deleteProject(project.id, db);
    expect(getProject(project.id, db)).toBeUndefined();
    expect(getAsset(asset.id, db)?.projectId).toBeNull();
  });

  it("scan_batches가 있는 프로젝트도 FK 오류 없이 삭제하고 자산·배치는 연결만 해제한다", () => {
    const p = createProject({ name: "P", pmName: "김", pmEmail: "p@nh.com", sharePassword: "pw" }, db);
    const asset = createRepoAsset({ displayName: "img", repoUrl: "https://github.com/nh/x", projectId: p.id }, db);
    const batch = createScanBatch(p.id, db);

    deleteProject(p.id, db);

    expect(getProject(p.id, db)).toBeUndefined();
    // 자산은 남고 project_id만 NULL
    expect(getAsset(asset.id, db)!.projectId).toBeNull();
    // 배치 행은 남고 project_id만 NULL
    const batchRow = db.prepare(`SELECT project_id FROM scan_batches WHERE id = ?`).get(batch.id) as { project_id: string | null };
    expect(batchRow.project_id).toBeNull();
  });
});

describe("updateProject", () => {
  it("throws ProjectNotFoundError for an unknown id", () => {
    expect(() => updateProject("unknown-id", { name: "x" }, db)).toThrow(ProjectNotFoundError);
  });
});

describe("regenerateShareLink", () => {
  it("throws ProjectNotFoundError for an unknown id", () => {
    expect(() => regenerateShareLink("unknown-id", "pw", db)).toThrow(ProjectNotFoundError);
  });
});

describe("verifyShareAccess", () => {
  it("succeeds with the correct token and password", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "correct-pw" }, db);
    expect(verifyShareAccess(project.shareToken, "correct-pw", db).ok).toBe(true);
  });

  it("fails with the wrong password", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "correct-pw" }, db);
    expect(verifyShareAccess(project.shareToken, "wrong-pw", db)).toEqual({ ok: false, reason: "wrong_password" });
  });

  it("returns not_found for an unknown token", () => {
    expect(verifyShareAccess("unknown-token", "any", db)).toEqual({ ok: false, reason: "not_found" });
  });

  it("locks the project after 5 failed attempts", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "correct-pw" }, db);
    for (let i = 0; i < 5; i++) verifyShareAccess(project.shareToken, "wrong", db);
    expect(verifyShareAccess(project.shareToken, "correct-pw", db)).toEqual({ ok: false, reason: "locked" });
  });

  it("resets the failure counter after regenerating the share link", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "old-pw" }, db);
    for (let i = 0; i < 5; i++) verifyShareAccess(project.shareToken, "wrong", db);
    const { shareToken } = regenerateShareLink(project.id, "new-pw", db);
    expect(verifyShareAccess(shareToken, "new-pw", db)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("gives a fresh attempt budget after a lock naturally expires", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "correct-pw" }, db);
    for (let i = 0; i < 5; i++) verifyShareAccess(project.shareToken, "wrong", db);
    // Simulate the lock having expired by moving it into the past directly in the DB.
    db.prepare(`UPDATE projects SET share_locked_until = ? WHERE id = ?`).run(
      new Date(Date.now() - 1000).toISOString(),
      project.id,
    );
    // One wrong attempt right after expiry should NOT immediately re-lock.
    const result = verifyShareAccess(project.shareToken, "still-wrong", db);
    expect(result).toEqual({ ok: false, reason: "wrong_password" });
  });

  it("rejects a disabled share link even with the correct password", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    setShareLinkEnabled(project.id, false, db);
    expect(verifyShareAccess(project.shareToken, "pw", db)).toEqual({ ok: false, reason: "disabled" });
  });

  it("rejects a revoked share link even with the correct password", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    revokeShareLink(project.id, db);
    expect(verifyShareAccess(project.shareToken, "pw", db)).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("setShareLinkEnabled / revokeShareLink (status transitions)", () => {
  it("toggles active -> disabled -> active", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    expect(setShareLinkEnabled(project.id, false, db)).toEqual({ shareStatus: "disabled" });
    expect(getProject(project.id, db)?.shareStatus).toBe("disabled");
    expect(setShareLinkEnabled(project.id, true, db)).toEqual({ shareStatus: "active" });
    expect(getProject(project.id, db)?.shareStatus).toBe("active");
  });

  it("revokes an active link permanently", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    expect(revokeShareLink(project.id, db)).toEqual({ shareStatus: "revoked" });
    expect(getProject(project.id, db)?.shareStatus).toBe("revoked");
  });

  it("rejects any attempt to re-activate or disable a revoked link", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    revokeShareLink(project.id, db);
    expect(() => setShareLinkEnabled(project.id, true, db)).toThrow(ShareLinkRevokedError);
    expect(() => setShareLinkEnabled(project.id, false, db)).toThrow(ShareLinkRevokedError);
    expect(getProject(project.id, db)?.shareStatus).toBe("revoked");
  });

  it("throws ProjectNotFoundError for an unknown id", () => {
    expect(() => setShareLinkEnabled("unknown-id", true, db)).toThrow(ProjectNotFoundError);
    expect(() => revokeShareLink("unknown-id", db)).toThrow(ProjectNotFoundError);
  });

  it("re-activates the link when regenerating, even after a revoke", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "old-pw" }, db);
    revokeShareLink(project.id, db);
    const { shareToken, shareStatus } = regenerateShareLink(project.id, "new-pw", db);
    expect(shareStatus).toBe("active");
    expect(getProject(project.id, db)?.shareStatus).toBe("active");
    expect(verifyShareAccess(shareToken, "new-pw", db)).toEqual(expect.objectContaining({ ok: true }));
  });
});

describe("getShareLinkStatus", () => {
  it("returns ok for an active token", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    expect(getShareLinkStatus(project.shareToken, db)).toEqual({ ok: true });
  });

  it("returns not_found for an unknown token", () => {
    expect(getShareLinkStatus("unknown-token", db)).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns disabled for a disabled token", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    setShareLinkEnabled(project.id, false, db);
    expect(getShareLinkStatus(project.shareToken, db)).toEqual({ ok: false, reason: "disabled" });
  });

  it("returns revoked for a revoked token", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    revokeShareLink(project.id, db);
    expect(getShareLinkStatus(project.shareToken, db)).toEqual({ ok: false, reason: "revoked" });
  });
});
