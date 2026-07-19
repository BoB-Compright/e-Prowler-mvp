import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import type { ScanInputSpec } from "@/lib/packs/types";
import { encodeScanInputs, decodeScanInputs, providedInputNames } from "./scanInputs";

const specs: ScanInputSpec[] = [
  { name: "tibero_home", label: "설치 경로", kind: "path", required: true },
  { name: "tibero_db_pass", label: "비밀번호", kind: "secret", required: true },
];

beforeEach(() => {
  process.env.INFRA_SECURITY_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("scanInputs codec", () => {
  it("stores non-secret plaintext and encrypts secret (roundtrip)", () => {
    const stored = encodeScanInputs(specs, { tibero_home: "/opt/tb", tibero_db_pass: "s3cret" });
    const parsed = JSON.parse(stored) as Record<string, string>;
    expect(parsed.tibero_home).toBe("/opt/tb"); // 평문
    expect(parsed.tibero_db_pass).not.toBe("s3cret"); // 암호문
    const decoded = decodeScanInputs(specs, stored);
    expect(decoded).toEqual({ tibero_home: "/opt/tb", tibero_db_pass: "s3cret" });
  });

  it("omits empty values", () => {
    const stored = encodeScanInputs(specs, { tibero_home: "  ", tibero_db_pass: "" });
    expect(JSON.parse(stored)).toEqual({});
    expect(decodeScanInputs(specs, stored)).toEqual({});
  });

  it("decodes null/blank stored as empty", () => {
    expect(decodeScanInputs(specs, null)).toEqual({});
    expect(decodeScanInputs(specs, "")).toEqual({});
  });

  it("providedInputNames returns names with non-empty values", () => {
    const names = providedInputNames(specs, { tibero_home: "/opt/tb", tibero_db_pass: "" });
    expect([...names]).toEqual(["tibero_home"]);
  });

  it("omits secret field with non-ciphertext value (decrypt failure)", () => {
    // stored JSON where a secret field holds plaintext instead of ciphertext
    const stored = JSON.stringify({
      tibero_home: "/opt/tb",
      tibero_db_pass: "not-a-ciphertext-string", // invalid secret format
    });
    const decoded = decodeScanInputs(specs, stored);
    // should return the valid plaintext field, omit the bad secret, not throw
    expect(decoded).toEqual({ tibero_home: "/opt/tb" });
  });

  it("returns empty object for non-object JSON (array, string, number)", () => {
    // JSON array
    expect(decodeScanInputs(specs, JSON.stringify([1, 2, 3]))).toEqual({});
    // JSON bare string
    expect(decodeScanInputs(specs, JSON.stringify("just-a-string"))).toEqual({});
    // JSON number
    expect(decodeScanInputs(specs, JSON.stringify(42))).toEqual({});
  });
});
