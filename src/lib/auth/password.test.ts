import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifies a correct password against its hash", () => {
    const hash = hashPassword("hunter2");
    expect(verifyPassword("hunter2", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("hunter2");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("returns false instead of throwing for a malformed stored value", () => {
    expect(verifyPassword("hunter2", "")).toBe(false);
    expect(verifyPassword("hunter2", "no-colon-here")).toBe(false);
    expect(verifyPassword("hunter2", "salt-only:")).toBe(false);
  });
});
