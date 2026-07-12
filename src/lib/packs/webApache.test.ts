import { describe, expect, it } from "vitest";
import { APACHE_EVIDENCE, getApacheState, moduleLoaded, activeLines, evaluateApacheWEB01, evaluateApacheWEB02, evaluateApacheWEB03, statNoGroupOtherWrite, isOwnerOnly } from "./webApache";

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

describe("account-management evaluators WEB-01/02/03", () => {
  const withAuth = [
    { taskName: "apache detection (internal)", stdout: "present" },
    { taskName: "apache effective config (internal)", stdout: 'AuthType Basic\nAuthName "x"\nAuthUserFile /etc/apache2/.htpasswd' },
  ];
  it("WEB-01/02 → review when basic auth is configured", () => {
    expect(evaluateApacheWEB01(withAuth).status).toBe("review");
    expect(evaluateApacheWEB02(withAuth).status).toBe("review");
  });
  it("WEB-01/02 → skip when no auth configured", () => {
    const noAuth = [{ taskName: "apache detection (internal)", stdout: "present" }, { taskName: "apache effective config (internal)", stdout: "ServerTokens Prod" }];
    expect(evaluateApacheWEB01(noAuth).status).toBe("skip");
  });
  it("WEB-03 pass/fail on AuthUserFile perms; skip when missing", () => {
    const ok = [{ taskName: "WEB-03: apache auth password file permissions", stdout: "root:root 600" }];
    const bad = [{ taskName: "WEB-03: apache auth password file permissions", stdout: "root:root 644" }];
    const none = [{ taskName: "WEB-03: apache auth password file permissions", stdout: "__MISSING__" }];
    expect(evaluateApacheWEB03(ok).status).toBe("pass");
    expect(evaluateApacheWEB03(bad).status).toBe("fail");
    expect(evaluateApacheWEB03(none).status).toBe("skip");
  });
  it("statNoGroupOtherWrite: no group/other WRITE bit (750 ok, 777/775 fail)", () => {
    expect(statNoGroupOtherWrite("root:adm 750")).toBe(true);
    expect(statNoGroupOtherWrite("root:adm 640")).toBe(true);
    expect(statNoGroupOtherWrite("root:root 777")).toBe(false);
    expect(statNoGroupOtherWrite("root:root 775")).toBe(false);
  });
  it("isOwnerOnly: owner-only (600/400 ok, 640/644/750 fail)", () => {
    expect(isOwnerOnly("root:root 600")).toBe(true);
    expect(isOwnerOnly("root:root 400")).toBe(true);
    expect(isOwnerOnly("root:root 640")).toBe(false);
    expect(isOwnerOnly("root:root 644")).toBe(false);
    expect(isOwnerOnly("root:adm 750")).toBe(false);
  });
});
