import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createRepoAsset, getAsset } from "@/lib/assets/store";
import {
  createProject,
  deleteProject,
  getProject,
  regenerateShareLink,
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
});

describe("deleteProject", () => {
  it("moves owned assets to unclassified instead of deleting them", () => {
    const project = createProject({ name: "A", pmName: "김PM", pmEmail: "a@nh.com", sharePassword: "pw" }, db);
    const asset = createRepoAsset({ displayName: "x", repoUrl: "https://github.com/x/x", projectId: project.id }, db);
    deleteProject(project.id, db);
    expect(getProject(project.id, db)).toBeUndefined();
    expect(getAsset(asset.id, db)?.projectId).toBeNull();
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
});
