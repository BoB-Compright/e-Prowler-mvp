import { describe, expect, it } from "vitest";
import { APACHE_EVIDENCE, getApacheState, moduleLoaded, activeLines } from "./webApache";

const present = [
  { taskName: "apache detection (internal)", stdout: "present\n" },
  { taskName: "apache modules (internal)", stdout: " core_module (static)\n dav_module (shared)\n ssl_module (shared)\n" },
  { taskName: "apache effective config (internal)", stdout: "ServerTokens Prod\n# a comment\n\nServerSignature Off\n" },
];

describe("apache evidence + state", () => {
  it("declares the 7 apache evidence tasks with unique names", () => {
    const names = APACHE_EVIDENCE.map((t) => t.name);
    expect(names).toContain("apache detection (internal)");
    expect(names).toContain("apache modules (internal)");
    expect(names).toContain("apache effective config (internal)");
    expect(new Set(names).size).toBe(names.length);
    expect(APACHE_EVIDENCE.length).toBe(7);
  });
  it("parses present/config/modules", () => {
    const s = getApacheState(present);
    expect(s.present).toBe(true);
    expect(s.modules).toEqual(expect.arrayContaining(["core_module", "dav_module", "ssl_module"]));
    expect(moduleLoaded(s.modules, "ssl_module")).toBe(true);
    expect(moduleLoaded(s.modules, "proxy_module")).toBe(false);
  });
  it("absent detection → present false", () => {
    expect(getApacheState([{ taskName: "apache detection (internal)", stdout: "absent" }]).present).toBe(false);
  });
  it("activeLines strips comments and blanks", () => {
    expect(activeLines("ServerTokens Prod\n# c\n\nServerSignature Off")).toEqual(["ServerTokens Prod", "ServerSignature Off"]);
  });
});
