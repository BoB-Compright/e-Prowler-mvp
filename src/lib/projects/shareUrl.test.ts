import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  resolveShareBaseUrl,
  resolveShareHost,
  isOnShareHost,
  isAllowedShareOnlyPath,
} from "./shareUrl";

describe("resolveShareBaseUrl", () => {
  it("returns the configured base URL", () => {
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "https://myname.ngrok-free.app" })).toBe(
      "https://myname.ngrok-free.app",
    );
  });

  it("strips trailing slashes and surrounding whitespace", () => {
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "  https://myname.ngrok-free.app/  " })).toBe(
      "https://myname.ngrok-free.app",
    );
  });

  it("returns null when unset or blank", () => {
    expect(resolveShareBaseUrl({})).toBeNull();
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "   " })).toBeNull();
  });

  it("prepends https:// when the value has no scheme", () => {
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "myname.ngrok-free.app" })).toBe(
      "https://myname.ngrok-free.app",
    );
  });
});

describe("buildShareUrl", () => {
  it("joins the base URL and share token path", () => {
    expect(buildShareUrl("https://myname.ngrok-free.app", "abc123")).toBe(
      "https://myname.ngrok-free.app/share/abc123",
    );
  });
});

describe("resolveShareHost", () => {
  it("returns the host of SHARE_BASE_URL", () => {
    expect(resolveShareHost({ SHARE_BASE_URL: "https://myname.ngrok-free.app" })).toBe(
      "myname.ngrok-free.app",
    );
  });

  it("returns null when unset or unparseable", () => {
    expect(resolveShareHost({})).toBeNull();
    expect(resolveShareHost({ SHARE_BASE_URL: "not a url" })).toBeNull();
  });

  it("returns the host for a scheme-less SHARE_BASE_URL", () => {
    expect(resolveShareHost({ SHARE_BASE_URL: "myname.ngrok-free.app" })).toBe(
      "myname.ngrok-free.app",
    );
  });
});

describe("isOnShareHost", () => {
  const env = { SHARE_BASE_URL: "https://myname.ngrok-free.app" };
  const SHARE_HOST = "myname.ngrok-free.app";

  it("is true when the host header matches the share host", () => {
    expect(isOnShareHost(SHARE_HOST, null, env)).toBe(true);
  });

  it("is true when the x-forwarded-host header matches the share host", () => {
    expect(isOnShareHost(null, SHARE_HOST, env)).toBe(true);
  });

  it("is true (fail-closed) when host matches but x-forwarded-host is spoofed to a different value", () => {
    expect(isOnShareHost(SHARE_HOST, "evil.example", env)).toBe(true);
  });

  it("is false when neither header matches the share host", () => {
    expect(isOnShareHost("localhost:3000", null, env)).toBe(false);
    expect(isOnShareHost(null, null, env)).toBe(false);
  });

  it("is false when SHARE_BASE_URL is unset (gate disabled)", () => {
    expect(isOnShareHost(SHARE_HOST, null, {})).toBe(false);
  });
});

describe("isAllowedShareOnlyPath", () => {
  it("allows only token-bearing share paths, not the bare prefix", () => {
    expect(isAllowedShareOnlyPath("/share")).toBe(false);
    expect(isAllowedShareOnlyPath("/share/abc123")).toBe(true);
    expect(isAllowedShareOnlyPath("/api/share")).toBe(false);
    expect(isAllowedShareOnlyPath("/api/share/abc123")).toBe(true);
  });
  it("blocks login, dashboard, internal APIs and near-miss paths", () => {
    expect(isAllowedShareOnlyPath("/login")).toBe(false);
    expect(isAllowedShareOnlyPath("/")).toBe(false);
    expect(isAllowedShareOnlyPath("/api/assets")).toBe(false);
    expect(isAllowedShareOnlyPath("/sharewolf")).toBe(false);
    expect(isAllowedShareOnlyPath("/api/shareX")).toBe(false);
  });
});
