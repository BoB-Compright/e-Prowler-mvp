import { describe, expect, it } from "vitest";
import { buildUpgradeGuide } from "./mitigationGuide";

describe("buildUpgradeGuide", () => {
  it("builds apt/yum upgrade commands for the given packages (deduped)", () => {
    const g = buildUpgradeGuide(["openssl", "openssl", "curl"]);
    expect(g.apt).toContain("apt-get install --only-upgrade openssl curl");
    expect(g.yum).toContain("yum update openssl curl");
  });
  it("handles empty package list", () => {
    const g = buildUpgradeGuide([]);
    expect(typeof g.apt).toBe("string");
    expect(typeof g.yum).toBe("string");
  });
});
