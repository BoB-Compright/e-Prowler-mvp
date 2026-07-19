import { describe, expect, it } from "vitest";
import { buildShareUrl, resolveShareBaseUrl } from "./shareUrl";

describe("resolveShareBaseUrl", () => {
  it("returns the configured base URL", () => {
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "https://guardian.nh.internal" })).toBe(
      "https://guardian.nh.internal",
    );
  });

  it("strips trailing slashes and surrounding whitespace", () => {
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "  https://guardian.nh.internal/  " })).toBe(
      "https://guardian.nh.internal",
    );
  });

  it("returns null when unset or blank", () => {
    expect(resolveShareBaseUrl({})).toBeNull();
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "   " })).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("joins the base URL and share token path", () => {
    expect(buildShareUrl("https://guardian.nh.internal", "abc123")).toBe(
      "https://guardian.nh.internal/share/abc123",
    );
  });
});
