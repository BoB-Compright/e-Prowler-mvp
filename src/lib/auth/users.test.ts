import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { createUser, getUserByUsername, verifyCredentials } from "./users";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("createUser", () => {
  it("creates a user with a hashed password (not the plaintext)", () => {
    const user = createUser("admin", "hunter2", db);
    expect(user.username).toBe("admin");
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as {
      password_hash: string;
    };
    expect(row.password_hash).not.toBe("hunter2");
  });

  it("rejects a duplicate username", () => {
    createUser("admin", "hunter2", db);
    expect(() => createUser("admin", "other-password", db)).toThrow();
  });
});

describe("getUserByUsername", () => {
  it("returns undefined for an unknown username", () => {
    expect(getUserByUsername("nobody", db)).toBeUndefined();
  });

  it("finds a user created earlier", () => {
    createUser("admin", "hunter2", db);
    expect(getUserByUsername("admin", db)?.username).toBe("admin");
  });
});

describe("verifyCredentials", () => {
  it("returns the user for correct credentials", () => {
    createUser("admin", "hunter2", db);
    expect(verifyCredentials("admin", "hunter2", db)?.username).toBe("admin");
  });

  it("returns null for a wrong password", () => {
    createUser("admin", "hunter2", db);
    expect(verifyCredentials("admin", "wrong", db)).toBeNull();
  });

  it("returns null for an unknown username", () => {
    expect(verifyCredentials("nobody", "hunter2", db)).toBeNull();
  });
});
