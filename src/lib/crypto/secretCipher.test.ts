import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret } from "./secretCipher";

beforeEach(() => {
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("secretCipher", () => {
  it("round-trips a plaintext secret", () => {
    const cipherText = encryptSecret("my-ssh-password");
    expect(decryptSecret(cipherText)).toBe("my-ssh-password");
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("throws a clear error when INFRA_SECURITY_MASTER_KEY is missing", () => {
    delete process.env.INFRA_SECURITY_MASTER_KEY;
    expect(() => encryptSecret("x")).toThrow(/INFRA_SECURITY_MASTER_KEY/);
  });

  it("throws a clear error for malformed cipherText", () => {
    expect(() => decryptSecret("onlyonepart")).toThrow(/형식/);
    expect(() => decryptSecret("a:b")).toThrow(/형식/);
  });
});
