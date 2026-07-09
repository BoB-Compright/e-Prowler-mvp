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

  // Guards the anti-enumeration property: unknown username and wrong password
  // must be indistinguishable in the return value (both plain null, no
  // error/undefined split). The equal-cost decoy hashing that equalizes the
  // *timing* of the two paths lives in verifyCredentials itself — timing is
  // not asserted here.
  it("is indistinguishable between unknown username and wrong password", () => {
    createUser("admin", "hunter2", db);
    const unknownUser = verifyCredentials("nobody", "hunter2", db);
    const wrongPassword = verifyCredentials("admin", "wrong", db);
    expect(unknownUser).toBeNull();
    expect(wrongPassword).toBeNull();
    expect(unknownUser).toStrictEqual(wrongPassword);
  });
});
