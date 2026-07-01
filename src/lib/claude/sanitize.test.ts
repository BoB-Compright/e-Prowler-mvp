import { describe, expect, it } from "vitest";
import { sanitizeForClaude } from "./sanitize";

describe("sanitizeForClaude", () => {
  it("redacts a GitHub PAT", () => {
    const input = "clone with ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    const output = sanitizeForClaude(input);
    expect(output).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(output).toContain("[REDACTED_GITHUB_PAT]");
  });

  it("redacts key=value secret assignments without leaking the value", () => {
    const output = sanitizeForClaude("ENV DB_PASSWORD=hunter2 and ARG API_KEY=abc123");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("abc123");
    expect(output).toContain("[REDACTED_SECRET_ASSIGNMENT]");
  });

  it("redacts an Authorization header", () => {
    const output = sanitizeForClaude("Authorization: Bearer sk-ant-abc123");
    expect(output).not.toContain("sk-ant-abc123");
    expect(output).toContain("[REDACTED_AUTH_HEADER]");
  });

  it("redacts a private key block", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n-----END RSA PRIVATE KEY-----";
    const output = sanitizeForClaude(`before ${key} after`);
    expect(output).not.toContain("MIIB");
    expect(output).toContain("[REDACTED_PRIVATE_KEY_BLOCK]");
  });

  it("redacts credentials embedded in a URL", () => {
    const output = sanitizeForClaude("https://user:secretpass@github.com/owner/repo.git");
    expect(output).not.toContain("secretpass");
    expect(output).toContain("[REDACTED_URL_CREDENTIALS]");
  });

  it("leaves clean text untouched", () => {
    const input = "Dockerfile USER 지시어: 있음 / 실행 컨테이너 UID: 1000";
    expect(sanitizeForClaude(input)).toBe(input);
  });
});
