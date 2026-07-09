import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { getUserByUsername, verifyCredentials } from "./users";
import { ensureSeedAdmin } from "./seedAdmin";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("ensureSeedAdmin", () => {
  it("creates the admin account from env vars when there are no users yet", () => {
    ensureSeedAdmin({ AUTH_ADMIN_USERNAME: "admin", AUTH_ADMIN_PASSWORD: "hunter2" }, db);
    expect(getUserByUsername("admin", db)).toBeDefined();
    expect(verifyCredentials("admin", "hunter2", db)).not.toBeNull();
  });

  it("does nothing when the env vars are missing", () => {
    ensureSeedAdmin({}, db);
    expect(getUserByUsername("admin", db)).toBeUndefined();
  });

  it("does nothing (idempotent) when a user already exists", () => {
    ensureSeedAdmin({ AUTH_ADMIN_USERNAME: "admin", AUTH_ADMIN_PASSWORD: "hunter2" }, db);
    ensureSeedAdmin({ AUTH_ADMIN_USERNAME: "someone-else", AUTH_ADMIN_PASSWORD: "other" }, db);
    expect(getUserByUsername("someone-else", db)).toBeUndefined();
    expect(getUserByUsername("admin", db)).toBeDefined();
  });

  it("never logs the plaintext password", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    ensureSeedAdmin({ AUTH_ADMIN_USERNAME: "admin", AUTH_ADMIN_PASSWORD: "super-secret-value" }, db);
    const loggedText = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedText).not.toContain("super-secret-value");
    logSpy.mockRestore();
  });
});
