import { describe, expect, it } from "vitest";
import { isVersionInRange } from "./versionRange";

describe("isVersionInRange", () => {
  it("returns true when no bounds are given (can't rule it out)", () => {
    expect(isVersionInRange("1.1.1f-1ubuntu2.16", {})).toBe(true);
  });

  it("respects versionEndExcluding, ignoring distro release suffixes", () => {
    expect(isVersionInRange("1.1.1f-1ubuntu2.16", { versionEndExcluding: "1.1.2" })).toBe(true);
    expect(isVersionInRange("1.1.2-1ubuntu1", { versionEndExcluding: "1.1.2" })).toBe(false);
  });

  it("respects versionEndIncluding", () => {
    expect(isVersionInRange("1.1.1", { versionEndIncluding: "1.1.1" })).toBe(true);
    expect(isVersionInRange("1.1.2", { versionEndIncluding: "1.1.1" })).toBe(false);
  });

  it("respects versionStartIncluding and versionStartExcluding", () => {
    expect(isVersionInRange("1.0.0", { versionStartIncluding: "1.0.0" })).toBe(true);
    expect(isVersionInRange("0.9.9", { versionStartIncluding: "1.0.0" })).toBe(false);
    expect(isVersionInRange("1.0.0", { versionStartExcluding: "1.0.0" })).toBe(false);
  });

  it("strips a dpkg epoch prefix before comparing", () => {
    expect(isVersionInRange("1:1.1.1f-1ubuntu2.16", { versionEndExcluding: "1.1.2" })).toBe(true);
  });
});
