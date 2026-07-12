import { describe, expect, it } from "vitest";
import {
  APACHE_EVIDENCE, getApacheState, moduleLoaded, activeLines,
  evaluateApacheWEB01, evaluateApacheWEB02, evaluateApacheWEB03,
  evaluateApacheWEB04, evaluateApacheWEB05, evaluateApacheWEB06, evaluateApacheWEB07,
  evaluateApacheWEB08, evaluateApacheWEB09, evaluateApacheWEB10, evaluateApacheWEB11, evaluateApacheWEB12,
  evaluateApacheWEB13, evaluateApacheWEB14, evaluateApacheWEB15, evaluateApacheWEB16, evaluateApacheWEB17, evaluateApacheWEB18,
  evaluateApacheWEB19, evaluateApacheWEB20, evaluateApacheWEB21, evaluateApacheWEB22, evaluateApacheWEB23, evaluateApacheWEB24, evaluateApacheWEB25, evaluateApacheWEB26,
  statNoGroupOtherWrite, isOwnerOnly,
} from "./webApache";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";

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

const cfg = (config: string, extra: AnsibleTaskOutput[] = []) => [
  { taskName: "apache detection (internal)", stdout: "present" },
  { taskName: "apache effective config (internal)", stdout: config },
  ...extra,
];
const mods = (list: string) => ({ taskName: "apache modules (internal)", stdout: list });

describe("service-management evaluators WEB-04/05/06/07/08/09/10/11/12", () => {
  it("WEB-04 listing: Indexes on → fail, off → pass", () => {
    expect(evaluateApacheWEB04([...cfg("Options Indexes FollowSymLinks"), mods(" autoindex_module (shared)")]).status).toBe("fail");
    expect(evaluateApacheWEB04([...cfg("Options -Indexes"), mods(" core_module (static)")]).status).toBe("pass");
  });
  it("WEB-05 → review", () => { expect(evaluateApacheWEB05().status).toBe("review"); });
  it("WEB-09 User root → fail, non-root → pass, absent → skip", () => {
    expect(evaluateApacheWEB09(cfg("User www-data\nGroup www-data")).status).toBe("pass");
    expect(evaluateApacheWEB09(cfg("User root")).status).toBe("fail");
    expect(evaluateApacheWEB09(cfg("ServerTokens Prod")).status).toBe("skip");
  });
  it("WEB-10 proxy loaded → fail, not → pass", () => {
    expect(evaluateApacheWEB10([...cfg(""), mods(" proxy_module (shared)")]).status).toBe("fail");
    expect(evaluateApacheWEB10([...cfg(""), mods(" core_module (static)")]).status).toBe("pass");
  });
  it("WEB-12 FollowSymLinks without owner-match → fail", () => {
    expect(evaluateApacheWEB12(cfg("Options FollowSymLinks")).status).toBe("fail");
    expect(evaluateApacheWEB12(cfg("Options SymLinksIfOwnerMatch")).status).toBe("pass");
  });
  it("WEB-07 leftovers → fail, clean → pass, missing → skip", () => {
    expect(evaluateApacheWEB07([...cfg(""), { taskName: "apache document root scan (internal)", stdout: "LEFTOVER:/var/www/html/phpinfo.php" }]).status).toBe("fail");
    expect(evaluateApacheWEB07([...cfg(""), { taskName: "apache document root scan (internal)", stdout: "__MISSING__" }]).status).toBe("skip");
  });
  it("WEB-08/11 → review", () => {
    expect(evaluateApacheWEB08().status).toBe("review");
    expect(evaluateApacheWEB11().status).toBe("review");
  });
  it("WEB-06 root Directory deny → pass, missing → fail", () => {
    expect(evaluateApacheWEB06(cfg("<Directory />\n  Require all denied\n</Directory>")).status).toBe("pass");
    expect(evaluateApacheWEB06(cfg("ServerTokens Prod")).status).toBe("fail");
  });
});

describe("service-management evaluators WEB-13/14/15/16/17/18", () => {
  it("WEB-13 .ht protection present → pass, absent → fail", () => {
    expect(evaluateApacheWEB13(cfg('<Files ~ "^\\.ht">\n  Require all denied\n</Files>')).status).toBe("pass");
    expect(evaluateApacheWEB13(cfg("ServerTokens Prod")).status).toBe("fail");
  });
  it("WEB-14 docroot Directory default-deny → pass else fail", () => {
    expect(evaluateApacheWEB14(cfg("<Directory /var/www/>\n  Require all denied\n</Directory>")).status).toBe("pass");
    expect(evaluateApacheWEB14(cfg("<Directory /var/www/>\n  Require all granted\n</Directory>")).status).toBe("fail");
  });
  it("WEB-15/17 → review", () => {
    expect(evaluateApacheWEB15().status).toBe("review");
    expect(evaluateApacheWEB17().status).toBe("review");
  });
  it("WEB-16 ServerTokens Prod + ServerSignature Off → pass", () => {
    expect(evaluateApacheWEB16(cfg("ServerTokens Prod\nServerSignature Off")).status).toBe("pass");
    expect(evaluateApacheWEB16(cfg("ServerTokens Full\nServerSignature On")).status).toBe("fail");
  });
  it("WEB-18 dav loaded → fail, not → pass", () => {
    expect(evaluateApacheWEB18([...cfg(""), mods(" dav_module (shared)\n dav_fs_module (shared)")]).status).toBe("fail");
    expect(evaluateApacheWEB18([...cfg(""), mods(" core_module (static)")]).status).toBe("pass");
  });
});

describe("security-settings and patch-log evaluators WEB-19/20/21/22/23/24/25/26", () => {
  it("WEB-19 SSI: mod_include loaded → fail, not → pass", () => {
    expect(evaluateApacheWEB19([...cfg(""), mods(" include_module (shared)")]).status).toBe("fail");
    expect(evaluateApacheWEB19([...cfg(""), mods(" core_module (static)")]).status).toBe("pass");
  });
  it("WEB-20 SSL: mod_ssl + SSLEngine on → pass else fail", () => {
    expect(evaluateApacheWEB20([...cfg("SSLEngine on"), mods(" ssl_module (shared)")]).status).toBe("pass");
    expect(evaluateApacheWEB20([...cfg(""), mods(" core_module (static)")]).status).toBe("fail");
  });
  it("WEB-21 http→https redirect present → pass else fail", () => {
    expect(evaluateApacheWEB21(cfg("RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301]")).status).toBe("pass");
    expect(evaluateApacheWEB21(cfg("ServerTokens Prod")).status).toBe("fail");
  });
  it("WEB-22/23/24 → review", () => {
    expect(evaluateApacheWEB22().status).toBe("review");
    expect(evaluateApacheWEB23().status).toBe("review");
    expect(evaluateApacheWEB24().status).toBe("review");
  });
  it("WEB-25 → review with version evidence", () => {
    const r = evaluateApacheWEB25([{ taskName: "apache version (internal)", stdout: "Server version: Apache/2.4.58 (Ubuntu)" }]);
    expect(r.status).toBe("review");
    expect(r.evidence).toContain("2.4.58");
  });
  it("WEB-26 log dir perms pass/fail; missing → skip", () => {
    expect(evaluateApacheWEB26([{ taskName: "WEB-26: apache log directory permissions", stdout: "root:adm 750" }]).status).toBe("pass");
    expect(evaluateApacheWEB26([{ taskName: "WEB-26: apache log directory permissions", stdout: "root:root 777" }]).status).toBe("fail");
    expect(evaluateApacheWEB26([{ taskName: "WEB-26: apache log directory permissions", stdout: "__MISSING__" }]).status).toBe("skip");
  });
});
