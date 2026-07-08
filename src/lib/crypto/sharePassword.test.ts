import { describe, expect, it } from "vitest";
import { hashSharePassword, verifySharePassword } from "./sharePassword";

describe("sharePassword", () => {
  it("verifies a correct password against its hash", () => {
    const hash = hashSharePassword("hunter2");
    expect(verifySharePassword("hunter2", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashSharePassword("hunter2");
    expect(verifySharePassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    expect(hashSharePassword("same")).not.toBe(hashSharePassword("same"));
  });

  it("returns false instead of throwing for a malformed stored value", () => {
    expect(verifySharePassword("hunter2", "")).toBe(false);
    expect(verifySharePassword("hunter2", "no-colon-here")).toBe(false);
    expect(verifySharePassword("hunter2", "salt-only:")).toBe(false);
  });
});
