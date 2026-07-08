import { existsSync, readFileSync, statSync } from "fs";
import { describe, expect, it } from "vitest";
import { withTempKeyFile } from "./tempKeyFile";

describe("withTempKeyFile", () => {
  it("creates a 0600 file with the key content and deletes it after", async () => {
    let capturedPath = "";
    await withTempKeyFile("-----PRIVATE KEY-----", async (path) => {
      capturedPath = path;
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe("-----PRIVATE KEY-----");
      expect(statSync(path).mode & 0o777).toBe(0o600);
    });
    expect(existsSync(capturedPath)).toBe(false);
  });

  it("still deletes the file when fn throws", async () => {
    let capturedPath = "";
    await expect(
      withTempKeyFile("k", async (path) => {
        capturedPath = path;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(capturedPath)).toBe(false);
  });
});
