import { describe, expect, it } from "vitest";
import {
  evaluateC01,
  evaluateC02,
  evaluateC03,
  evaluateC04,
  evaluateC05,
  evaluateC06,
  evaluateC07,
  evaluateC08,
  evaluateC09,
  evaluateU01,
  evaluateU02,
  evaluateU03,
  evaluateU04,
  evaluateU05,
  evaluateU06,
  evaluateU07,
  evaluateU08,
  evaluateU09,
  evaluateU10,
  evaluateU11,
  evaluateU12,
  evaluateU13,
  evaluateU14,
  evaluateU15,
  evaluateU16,
  evaluateU17,
  evaluateU18,
  evaluateU19,
  evaluateU20,
  evaluateU21,
  evaluateU22,
  evaluateU23,
  evaluateU24,
  evaluateU25,
  evaluateU26,
  evaluateU27,
  evaluateU28,
  evaluateU29,
  evaluateU30,
  evaluateU31,
  evaluateU32,
  evaluateU33,
  evaluateU34,
  evaluateU35,
  evaluateU36,
  evaluateU37,
  evaluateU38,
  evaluateU39,
  evaluateU40,
  evaluateU41,
  evaluateU42,
  evaluateU43,
  evaluateU44,
  evaluateU45,
  evaluateU46,
  evaluateU47,
  evaluateU48,
  evaluateU49,
  evaluateU50,
  evaluateU51,
  evaluateU52,
  evaluateU53,
  evaluateU54,
  evaluateU55,
  evaluateU56,
  evaluateU57,
  evaluateU58,
  evaluateU59,
  evaluateU60,
  evaluateU61,
  evaluateU62,
  evaluateU63,
  evaluateU64,
  evaluateU65,
  evaluateU66,
  evaluateU67,
  evaluateW01,
  evaluateW08,
  evaluateW09,
  evaluateW21,
  evaluateW22,
  evaluateW25,
  evaluateW26,
  evaluateIisOnly,
} from "./ruleEvaluation";
import type { AnsibleTaskOutput } from "./ansibleRunner";
import type { DockerfileFindings } from "./dockerfileChecks";

function task(taskName: string, stdout: string): AnsibleTaskOutput {
  return { taskName, stdout };
}

// Builds the ansible task list the real W-check evaluators expect: nginx
// detection + effective config (`nginx -T`) + (optionally) the W-22
// permissions dump. Pass config: null to simulate "nginx not detected".
function nginxTasks(config: string | null, w22Stdout = ""): AnsibleTaskOutput[] {
  return [
    task("nginx detection (internal)", config === null ? "absent" : "present"),
    task("nginx effective config (internal)", config === null ? "__MISSING__" : config),
    task("W-22: nginx config file permissions", w22Stdout),
  ];
}

// Task-list builders for the #46 service-family internal helpers (mirrors
// nginxTasks above): pass null to simulate "service not detected".
function mailTasks(variant: "postfix" | "sendmail" | "exim" | null): AnsibleTaskOutput[] {
  return [task("mail service detection (internal)", variant ?? "absent")];
}

function dnsTasks(present: boolean, config: string | null): AnsibleTaskOutput[] {
  return [
    task("dns service detection (internal)", present ? "present" : "absent"),
    task("dns effective config (internal)", config === null ? "__MISSING__" : config),
  ];
}

function ftpTasks(variant: "vsftpd" | "proftpd" | "pure-ftpd" | null, config: string | null): AnsibleTaskOutput[] {
  return [
    task("ftp service detection (internal)", variant ?? "absent"),
    task("ftp effective config (internal)", config === null ? "__MISSING__" : config),
  ];
}

function snmpTasks(present: boolean, config: string | null): AnsibleTaskOutput[] {
  return [
    task("snmp service detection (internal)", present ? "present" : "absent"),
    task("snmp effective config (internal)", config === null ? "__MISSING__" : config),
  ];
}

function findings(overrides: Partial<DockerfileFindings> = {}): DockerfileFindings {
  return {
    hasUserInstruction: true,
    hardcodedSecretVars: [],
    exposedPorts: [],
    baseImages: [],
    hasHealthcheck: true,
    remoteAddSources: [],
    ...overrides,
  };
}

describe("evaluateC01", () => {
  it("passes when USER is set and runtime uid is non-zero", () => {
    const result = evaluateC01(findings(), [task("C-01: runtime uid", "1000\n")]);
    expect(result).toMatchObject({ id: "C-01", status: "pass" });
  });

  it("fails when USER is missing even if uid happens to be non-zero", () => {
    const result = evaluateC01(findings({ hasUserInstruction: false }), [
      task("C-01: runtime uid", "1000\n"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("fails when runtime uid is 0 even if USER is set", () => {
    const result = evaluateC01(findings(), [task("C-01: runtime uid", "0\n")]);
    expect(result.status).toBe("fail");
  });

  it("falls back to runtime uid only when there is no Dockerfile (local image fallback, #41)", () => {
    expect(evaluateC01(null, [task("C-01: runtime uid", "1000\n")]).status).toBe("pass");
    expect(evaluateC01(null, [task("C-01: runtime uid", "0\n")]).status).toBe("fail");
  });
});

describe("evaluateC02", () => {
  it("passes with no hardcoded secret vars", () => {
    expect(evaluateC02(findings()).status).toBe("pass");
  });

  it("fails and lists variable names (never values) when secrets are found", () => {
    const result = evaluateC02(findings({ hardcodedSecretVars: ["DB_PASSWORD", "API_KEY"] }));
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("DB_PASSWORD");
    expect(result.evidence).toContain("API_KEY");
  });

  it("skips when there is no Dockerfile (local image fallback, #41)", () => {
    expect(evaluateC02(null).status).toBe("skip");
  });
});

describe("evaluateC03", () => {
  it("passes when no admin/db ports are exposed or listening", () => {
    const result = evaluateC03(findings({ exposedPorts: ["8080"] }), [
      task("C-03: listening ports", "State  Recv-Q Send-Q Local Address:Port\nLISTEN 0 128 0.0.0.0:8080 0.0.0.0:*\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when an admin/db port is EXPOSEd", () => {
    const result = evaluateC03(findings({ exposedPorts: ["3306"] }), [
      task("C-03: listening ports", "__MISSING__"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("fails when an admin/db port is actually listening at runtime", () => {
    const result = evaluateC03(findings(), [
      task("C-03: listening ports", "LISTEN 0 128 0.0.0.0:22 0.0.0.0:*\n"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("22");
  });

  it("still evaluates listening ports when there is no Dockerfile (local image fallback, #41)", () => {
    const result = evaluateC03(null, [
      task("C-03: listening ports", "LISTEN 0 128 0.0.0.0:3306 0.0.0.0:*\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateC04", () => {
  it("passes when all base images are pinned", () => {
    const result = evaluateC04(
      findings({ baseImages: [{ image: "node", tag: "18.20.4-alpine", pinned: true }] }),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when a base image has no tag or uses :latest", () => {
    const result = evaluateC04(findings({ baseImages: [{ image: "alpine", tag: null, pinned: false }] }));
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("alpine");
  });

  it("skips when there is no Dockerfile (local image fallback, #41)", () => {
    expect(evaluateC04(null).status).toBe("skip");
  });
});

describe("evaluateC05", () => {
  it("passes when no dangerous packages are found", () => {
    expect(evaluateC05([task("C-05: dangerous packages present", "")]).status).toBe("pass");
  });

  it("fails and lists dangerous packages present in the container", () => {
    const result = evaluateC05([task("C-05: dangerous packages present", "curl\ngcc\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("curl");
    expect(result.evidence).toContain("gcc");
  });
});

describe("evaluateC06", () => {
  it("passes when no setuid/setgid binaries are found", () => {
    expect(evaluateC06([task("C-06: setuid setgid binaries", "")]).status).toBe("pass");
  });

  it("passes when only standard setuid binaries are found", () => {
    const result = evaluateC06([task("C-06: setuid setgid binaries", "/usr/bin/passwd\n/usr/bin/su\n")]);
    expect(result.status).toBe("pass");
  });

  it("fails when an unexpected setuid binary is found", () => {
    const result = evaluateC06([task("C-06: setuid setgid binaries", "/opt/app/backdoor\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/opt/app/backdoor");
  });
});

describe("evaluateC07", () => {
  it("fails when / is mounted rw (no --read-only applied)", () => {
    const result = evaluateC07([
      task("C-07: root filesystem writability", "overlay / overlay rw,relatime 0 0\n"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("passes when / is mounted ro", () => {
    const result = evaluateC07([
      task("C-07: root filesystem writability", "overlay / overlay ro,relatime 0 0\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("skips when the mount entry could not be read", () => {
    expect(evaluateC07([task("C-07: root filesystem writability", "")]).status).toBe("skip");
  });
});

describe("evaluateC08", () => {
  it("passes when HEALTHCHECK is present", () => {
    expect(evaluateC08(findings({ hasHealthcheck: true })).status).toBe("pass");
  });

  it("fails when HEALTHCHECK is missing", () => {
    expect(evaluateC08(findings({ hasHealthcheck: false })).status).toBe("fail");
  });

  it("skips when there is no Dockerfile (local image fallback, #41)", () => {
    expect(evaluateC08(null).status).toBe("skip");
  });
});

describe("evaluateC09", () => {
  it("passes when ADD is not used with a remote URL", () => {
    expect(evaluateC09(findings()).status).toBe("pass");
  });

  it("fails when ADD pulls from a remote URL", () => {
    const result = evaluateC09(findings({ remoteAddSources: ["https://example.com/app.tar.gz"] }));
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("https://example.com/app.tar.gz");
  });

  it("skips when there is no Dockerfile (local image fallback, #41)", () => {
    expect(evaluateC09(null).status).toBe("skip");
  });
});

describe("evaluateU01", () => {
  it("skips when sshd_config does not exist", () => {
    expect(evaluateU01([task("U-01: sshd PermitRootLogin setting", "__MISSING__")]).status).toBe("skip");
  });

  it("fails when PermitRootLogin is not configured at all", () => {
    expect(evaluateU01([task("U-01: sshd PermitRootLogin setting", "")]).status).toBe("fail");
  });

  it("fails when PermitRootLogin yes", () => {
    expect(evaluateU01([task("U-01: sshd PermitRootLogin setting", "PermitRootLogin yes\n")]).status).toBe("fail");
  });

  it("passes when PermitRootLogin no", () => {
    expect(evaluateU01([task("U-01: sshd PermitRootLogin setting", "PermitRootLogin no\n")]).status).toBe("pass");
  });

  it("ignores commented-out lines", () => {
    const result = evaluateU01([
      task("U-01: sshd PermitRootLogin setting", "#PermitRootLogin yes\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU02", () => {
  it("skips when login.defs does not exist", () => {
    expect(evaluateU02([task("U-02: login.defs password aging policy", "__MISSING__")]).status).toBe("skip");
  });

  it("passes with a strict policy", () => {
    const result = evaluateU02([
      task("U-02: login.defs password aging policy", "PASS_MAX_DAYS   90\nPASS_MIN_LEN    8\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails with the weak Debian defaults", () => {
    const result = evaluateU02([
      task("U-02: login.defs password aging policy", "PASS_MAX_DAYS   99999\nPASS_MIN_LEN    5\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU03", () => {
  it("skips when no PAM auth file exists", () => {
    expect(evaluateU03([task("U-03: account lockout PAM module", "__MISSING__")]).status).toBe("skip");
  });

  it("fails when no lockout module is configured", () => {
    expect(evaluateU03([task("U-03: account lockout PAM module", "auth required pam_unix.so\n")]).status).toBe("fail");
  });

  it("passes when pam_faillock is configured", () => {
    const result = evaluateU03([
      task("U-03: account lockout PAM module", "auth required pam_faillock.so deny=5\n"),
    ]);
    expect(result.status).toBe("pass");
  });
});

describe("evaluateU04", () => {
  it("skips when /etc/passwd does not exist", () => {
    expect(evaluateU04([task("U-04: passwd password field protection", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when every field is x", () => {
    expect(evaluateU04([task("U-04: passwd password field protection", "x\nx\n")]).status).toBe("pass");
  });

  it("fails when a real hash is exposed in /etc/passwd", () => {
    const result = evaluateU04([
      task("U-04: passwd password field protection", "x\n$6$abc$hash\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU05", () => {
  it("skips when /etc/passwd does not exist", () => {
    expect(evaluateU05([task("U-05: accounts with UID 0", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when only root has UID 0", () => {
    expect(evaluateU05([task("U-05: accounts with UID 0", "root:0\nnhit:20001\n")]).status).toBe("pass");
  });

  it("fails when a non-root account has UID 0", () => {
    const result = evaluateU05([task("U-05: accounts with UID 0", "root:0\nbackdoor:0\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("backdoor");
  });
});

describe("evaluateU06", () => {
  it("skips when /etc/pam.d/su does not exist", () => {
    expect(evaluateU06([task("U-06: su restricted via pam_wheel", "__MISSING__")]).status).toBe("skip");
  });

  it("fails when pam_wheel is only present commented out", () => {
    expect(evaluateU06([task("U-06: su restricted via pam_wheel", "#auth required pam_wheel.so\n")]).status).toBe(
      "fail",
    );
  });

  it("passes when pam_wheel is active", () => {
    expect(evaluateU06([task("U-06: su restricted via pam_wheel", "auth required pam_wheel.so\n")]).status).toBe(
      "pass",
    );
  });
});

describe("evaluateU07", () => {
  it("skips when /etc/passwd does not exist", () => {
    expect(evaluateU07([task("U-07: unnecessary default accounts", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when no unnecessary accounts remain", () => {
    expect(evaluateU07([task("U-07: unnecessary default accounts", "root\nnhit\n")]).status).toBe("pass");
  });

  it("fails when unnecessary accounts remain", () => {
    const result = evaluateU07([task("U-07: unnecessary default accounts", "root\ngames\nnews\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("games");
  });
});

describe("evaluateU08", () => {
  it("skips when no admin groups are defined", () => {
    expect(evaluateU08([task("U-08: admin group membership", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when admin groups have no extra members", () => {
    expect(evaluateU08([task("U-08: admin group membership", "root:x:0:\n")]).status).toBe("pass");
  });

  it("passes when root lists itself as a member of its own admin group (Alpine convention)", () => {
    expect(evaluateU08([task("U-08: admin group membership", "root:x:0:root\nwheel:x:10:root\n")]).status).toBe(
      "pass",
    );
  });

  it("fails when an app user is added to wheel", () => {
    const result = evaluateU08([task("U-08: admin group membership", "root:x:0:\nwheel:x:10:nhit\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("nhit");
  });
});

describe("evaluateU09", () => {
  it("skips when /etc/passwd or /etc/group does not exist", () => {
    expect(evaluateU09([task("U-09: passwd GIDs missing from group file", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when every passwd GID exists in /etc/group", () => {
    const result = evaluateU09([
      task("U-09: passwd GIDs missing from group file", "__PASSWD__\n0\n20001\n__GROUP__\n0\n20001\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when a passwd GID has no matching /etc/group entry", () => {
    const result = evaluateU09([
      task("U-09: passwd GIDs missing from group file", "__PASSWD__\n0\n999\n__GROUP__\n0\n"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("999");
  });
});

describe("evaluateU10", () => {
  it("skips when /etc/passwd does not exist", () => {
    expect(evaluateU10([task("U-10: duplicate UIDs", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when all UIDs are unique", () => {
    expect(evaluateU10([task("U-10: duplicate UIDs", "0\n1000\n1001\n")]).status).toBe("pass");
  });

  it("fails when a UID is shared by two accounts", () => {
    const result = evaluateU10([task("U-10: duplicate UIDs", "0\n1000\n1000\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("1000");
  });
});

describe("evaluateU11", () => {
  it("skips when /etc/passwd does not exist", () => {
    expect(evaluateU11([task("U-11: system account shells", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when system accounts use nologin shells", () => {
    const result = evaluateU11([
      task("U-11: system account shells", "root:0:/bin/bash\ndaemon:1:/usr/sbin/nologin\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when a system account has a real shell", () => {
    const result = evaluateU11([task("U-11: system account shells", "games:5:/bin/sh\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("games");
  });

  it("does not flag standard sync/shutdown/halt placeholder accounts", () => {
    const result = evaluateU11([
      task(
        "U-11: system account shells",
        "sync:4:/bin/sync\nshutdown:6:/sbin/shutdown\nhalt:7:/sbin/halt\n",
      ),
    ]);
    expect(result.status).toBe("pass");
  });
});

describe("evaluateU12", () => {
  it("skips when /etc/profile does not exist", () => {
    expect(evaluateU12([task("U-12: shell session TMOUT", "__MISSING__")]).status).toBe("skip");
  });

  it("fails when TMOUT is not set", () => {
    expect(evaluateU12([task("U-12: shell session TMOUT", "")]).status).toBe("fail");
  });

  it("passes with a reasonable TMOUT", () => {
    expect(evaluateU12([task("U-12: shell session TMOUT", "TMOUT=600\n")]).status).toBe("pass");
  });

  it("fails when TMOUT is unreasonably long", () => {
    expect(evaluateU12([task("U-12: shell session TMOUT", "TMOUT=99999\n")]).status).toBe("fail");
  });
});

describe("evaluateU13", () => {
  it("skips when login.defs does not exist", () => {
    expect(evaluateU13([task("U-13: password hashing algorithm", "__MISSING__")]).status).toBe("skip");
  });

  it("fails when ENCRYPT_METHOD is not set", () => {
    expect(evaluateU13([task("U-13: password hashing algorithm", "")]).status).toBe("fail");
  });

  it("passes with SHA512", () => {
    expect(evaluateU13([task("U-13: password hashing algorithm", "ENCRYPT_METHOD SHA512\n")]).status).toBe("pass");
  });

  it("fails with a weak algorithm", () => {
    expect(evaluateU13([task("U-13: password hashing algorithm", "ENCRYPT_METHOD MD5\n")]).status).toBe("fail");
  });
});

describe("evaluateU16", () => {
  it("passes for root:root 644", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "root:root 644\n")]);
    expect(result.status).toBe("pass");
  });

  it("fails when group/other has write permission", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "root:root 666\n")]);
    expect(result.status).toBe("fail");
  });

  it("fails when not owned by root:root", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "appuser:appuser 644\n")]);
    expect(result.status).toBe("fail");
  });

  it("skips when /etc/passwd does not exist in the container", () => {
    const result = evaluateU16([task("U-16: /etc/passwd owner and mode", "__MISSING__\n")]);
    expect(result.status).toBe("skip");
  });
});

describe("evaluateU14", () => {
  it("skips when /root does not exist", () => {
    expect(evaluateU14([task("U-14: root PATH and home directory permissions", "__MISSING__")]).status).toBe(
      "skip",
    );
  });

  it("passes with a safe home dir and no current-dir in PATH", () => {
    const result = evaluateU14([
      task(
        "U-14: root PATH and home directory permissions",
        'root:root 700\nexport PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\n',
      ),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when the home directory is group/other writable", () => {
    const result = evaluateU14([
      task("U-14: root PATH and home directory permissions", "root:root 777\nPATH=/usr/bin:/bin\n"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("fails when PATH includes the current directory", () => {
    const result = evaluateU14([
      task("U-14: root PATH and home directory permissions", "root:root 700\nPATH=.:/usr/bin:/bin\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateW01", () => {
  it("skips when nginx is not detected", () => {
    expect(evaluateW01(nginxTasks(null)).status).toBe("skip");
  });

  it("passes when autoindex is not on anywhere in the effective config", () => {
    const result = evaluateW01(nginxTasks("server {\n  autoindex off;\n}\n"));
    expect(result.status).toBe("pass");
  });

  it("fails when autoindex on is present", () => {
    const result = evaluateW01(nginxTasks("server {\n  location /files/ {\n    autoindex on;\n  }\n}\n"));
    expect(result.status).toBe("fail");
  });
});

describe("evaluateW08", () => {
  it("skips when nginx is not detected", () => {
    expect(evaluateW08(nginxTasks(null)).status).toBe("skip");
  });

  it("passes when both access_log and error_log are configured", () => {
    const result = evaluateW08(
      nginxTasks("http {\n  access_log /var/log/nginx/access.log main;\n  error_log /var/log/nginx/error.log warn;\n}\n"),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when access_log is turned off", () => {
    const result = evaluateW08(
      nginxTasks("http {\n  access_log off;\n  error_log /var/log/nginx/error.log warn;\n}\n"),
    );
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU15", () => {
  it("passes when every file has a valid owner and group", () => {
    expect(evaluateU15([task("U-15: files and directories without a valid owner", "")]).status).toBe("pass");
  });

  it("fails when orphaned files are found", () => {
    const result = evaluateU15([
      task("U-15: files and directories without a valid owner", "/opt/leftover/file\n"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/opt/leftover/file");
  });
});

describe("evaluateU17", () => {
  it("skips when /etc/init.d does not exist", () => {
    expect(evaluateU17([task("U-17: system startup script permissions", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when no startup scripts have unsafe ownership/permissions", () => {
    expect(evaluateU17([task("U-17: system startup script permissions", "")]).status).toBe("pass");
  });

  it("fails when a startup script is writable by group/other or not root-owned", () => {
    const result = evaluateU17([
      task("U-17: system startup script permissions", "/etc/init.d/custom\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateW09", () => {
  it("skips when nginx is not detected", () => {
    expect(evaluateW09(nginxTasks(null)).status).toBe("skip");
  });

  it("passes with a custom error_page directive", () => {
    const result = evaluateW09(nginxTasks("server {\n  error_page 404 /404.html;\n}\n"));
    expect(result.status).toBe("pass");
  });

  it("passes when server_tokens is off even without a custom error_page", () => {
    const result = evaluateW09(nginxTasks("http {\n  server_tokens off;\n}\n"));
    expect(result.status).toBe("pass");
  });

  it("fails with no custom error_page and server_tokens left at its default", () => {
    const result = evaluateW09(nginxTasks("http {\n  server_tokens on;\n}\n"));
    expect(result.status).toBe("fail");
  });
});

describe("evaluateW21", () => {
  it("skips when nginx is not detected", () => {
    expect(evaluateW21(nginxTasks(null)).status).toBe("skip");
  });

  it("passes when the user directive is set to a non-root account", () => {
    const result = evaluateW21(nginxTasks("user nginx;\nworker_processes auto;\n"));
    expect(result.status).toBe("pass");
  });

  it("fails when the user directive is set to root", () => {
    const result = evaluateW21(nginxTasks("user root;\nworker_processes auto;\n"));
    expect(result.status).toBe("fail");
  });

  it("fails when there is no user directive at all", () => {
    const result = evaluateW21(nginxTasks("worker_processes auto;\n"));
    expect(result.status).toBe("fail");
  });
});

describe("evaluateW22", () => {
  it("skips when nginx is not detected", () => {
    expect(evaluateW22(nginxTasks(null)).status).toBe("skip");
  });

  it("passes when config files are not world-writable", () => {
    const result = evaluateW22(
      nginxTasks("http {}\n", "/etc/nginx/nginx.conf root:root 644\n/etc/nginx/conf.d/default.conf root:root 644\n"),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when a config file is world-writable", () => {
    const result = evaluateW22(
      nginxTasks("http {}\n", "/etc/nginx/nginx.conf root:root 646\n"),
    );
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/etc/nginx/nginx.conf");
  });
});

describe("evaluateW25", () => {
  it("skips when nginx is not detected", () => {
    expect(evaluateW25(nginxTasks(null)).status).toBe("skip");
  });

  it("passes when limit_except restricts methods", () => {
    const result = evaluateW25(
      nginxTasks("location / {\n  limit_except GET POST {\n    deny all;\n  }\n}\n"),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when no method restriction is configured", () => {
    const result = evaluateW25(nginxTasks("server {\n  listen 80;\n}\n"));
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU18", () => {
  it("skips when /etc/shadow does not exist", () => {
    expect(evaluateU18([task("U-18: /etc/shadow owner and mode", "__MISSING__")]).status).toBe("skip");
  });

  it("passes for the classic root:root 400", () => {
    expect(evaluateU18([task("U-18: /etc/shadow owner and mode", "root:root 400\n")]).status).toBe("pass");
  });

  it("passes for the Debian/Ubuntu default root:shadow 640", () => {
    expect(evaluateU18([task("U-18: /etc/shadow owner and mode", "root:shadow 640\n")]).status).toBe("pass");
  });

  it("fails when other has any access", () => {
    expect(evaluateU18([task("U-18: /etc/shadow owner and mode", "root:root 644\n")]).status).toBe("fail");
  });

  it("fails when not owned by root", () => {
    expect(evaluateU18([task("U-18: /etc/shadow owner and mode", "appuser:appuser 600\n")]).status).toBe("fail");
  });
});

describe("evaluateU19", () => {
  it("skips when /etc/hosts does not exist", () => {
    expect(evaluateU19([task("U-19: /etc/hosts owner and mode", "__MISSING__")]).status).toBe("skip");
  });

  it("passes for root:root 644", () => {
    expect(evaluateU19([task("U-19: /etc/hosts owner and mode", "root:root 644\n")]).status).toBe("pass");
  });

  it("fails when group/other has write permission", () => {
    expect(evaluateU19([task("U-19: /etc/hosts owner and mode", "root:root 666\n")]).status).toBe("fail");
  });
});

describe("evaluateU20", () => {
  it("skips when neither inetd.conf nor xinetd.conf exists", () => {
    expect(evaluateU20([task("U-20: (x)inetd.conf owner and mode", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when the existing file has safe owner/mode", () => {
    const result = evaluateU20([
      task("U-20: (x)inetd.conf owner and mode", "/etc/inetd.conf root:root 600\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when the file is writable by group/other", () => {
    const result = evaluateU20([
      task("U-20: (x)inetd.conf owner and mode", "/etc/inetd.conf root:root 666\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU21", () => {
  it("skips when neither syslog.conf nor rsyslog.conf exists", () => {
    expect(evaluateU21([task("U-21: (r)syslog.conf owner and mode", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when the existing file has safe owner/mode", () => {
    const result = evaluateU21([
      task("U-21: (r)syslog.conf owner and mode", "/etc/rsyslog.conf root:root 644\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when not owned by root", () => {
    const result = evaluateU21([
      task("U-21: (r)syslog.conf owner and mode", "/etc/rsyslog.conf syslog:syslog 644\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU22", () => {
  it("skips when /etc/services does not exist", () => {
    expect(evaluateU22([task("U-22: /etc/services owner and mode", "__MISSING__")]).status).toBe("skip");
  });

  it("passes for root:root 644", () => {
    expect(evaluateU22([task("U-22: /etc/services owner and mode", "root:root 644\n")]).status).toBe("pass");
  });

  it("fails when group/other has write permission", () => {
    expect(evaluateU22([task("U-22: /etc/services owner and mode", "root:root 664\n")]).status).toBe("fail");
  });
});

describe("evaluateU23", () => {
  it("skips when no world-writable temp directories exist", () => {
    expect(
      evaluateU23([task("U-23: setuid setgid sticky-bit files in world-writable dirs", "__MISSING__")]).status,
    ).toBe("skip");
  });

  it("passes when no suid/sgid/sticky files exist under /tmp", () => {
    expect(evaluateU23([task("U-23: setuid setgid sticky-bit files in world-writable dirs", "")]).status).toBe(
      "pass",
    );
  });

  it("fails when a suid/sgid/sticky file is planted under /tmp", () => {
    const result = evaluateU23([
      task("U-23: setuid setgid sticky-bit files in world-writable dirs", "/tmp/.hidden/backdoor\n"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/tmp/.hidden/backdoor");
  });
});

describe("evaluateU24", () => {
  it("skips when no system environment variable files exist", () => {
    expect(evaluateU24([task("U-24: environment variable file owner and mode", "__MISSING__")]).status).toBe(
      "skip",
    );
  });

  it("passes when files have safe owner/mode", () => {
    const result = evaluateU24([
      task("U-24: environment variable file owner and mode", "/etc/profile root:root 644\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when a file is writable by group/other", () => {
    const result = evaluateU24([
      task("U-24: environment variable file owner and mode", "/etc/profile root:root 666\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU25", () => {
  it("passes when no world-writable files are found", () => {
    expect(evaluateU25([task("U-25: world writable files", "")]).status).toBe("pass");
  });

  it("fails when a world-writable file is found", () => {
    const result = evaluateU25([task("U-25: world writable files", "/opt/app/config.yml\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/opt/app/config.yml");
  });
});

describe("evaluateU26", () => {
  it("skips when /dev does not exist", () => {
    expect(evaluateU26([task("U-26: irregular files under /dev", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when no irregular files are found", () => {
    expect(evaluateU26([task("U-26: irregular files under /dev", "")]).status).toBe("pass");
  });

  it("ignores standard Docker-injected device nodes like /dev/console", () => {
    expect(evaluateU26([task("U-26: irregular files under /dev", "/dev/console\n")]).status).toBe("pass");
  });

  it("fails when an unexpected regular file exists under /dev", () => {
    const result = evaluateU26([task("U-26: irregular files under /dev", "/dev/evil\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/dev/evil");
  });
});

describe("evaluateU27", () => {
  it("passes when neither hosts.equiv nor .rhosts is used", () => {
    expect(evaluateU27([task("U-27: .rhosts and hosts.equiv usage", "")]).status).toBe("pass");
  });

  it("fails when /etc/hosts.equiv has active entries", () => {
    const result = evaluateU27([
      task("U-27: .rhosts and hosts.equiv usage", "__EQUIV_START__\n+\n__EQUIV_END__\n"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("fails when a .rhosts file is found", () => {
    const result = evaluateU27([task("U-27: .rhosts and hosts.equiv usage", "/root/.rhosts\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/root/.rhosts");
  });
});

describe("evaluateU28", () => {
  it("skips when no access control mechanism is present", () => {
    expect(evaluateU28([task("U-28: connection IP and port restriction", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when hosts.allow has active rules", () => {
    const result = evaluateU28([
      task("U-28: connection IP and port restriction", "__ALLOW_START__\nsshd: 10.0.0.0/8\n__ALLOW_END__\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("passes when iptables has actual rules", () => {
    const result = evaluateU28([
      task(
        "U-28: connection IP and port restriction",
        "__IPTABLES_START__\nChain INPUT (policy DROP)\ntarget prot opt source destination\nACCEPT tcp -- 10.0.0.0/8 0.0.0.0/0\n__IPTABLES_END__\n",
      ),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when hosts.allow/deny and iptables exist but have no rules", () => {
    const result = evaluateU28([
      task(
        "U-28: connection IP and port restriction",
        "__ALLOW_START__\n__ALLOW_END__\n__IPTABLES_START__\nChain INPUT (policy ACCEPT)\ntarget prot opt source destination\n__IPTABLES_END__\n",
      ),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU29", () => {
  it("skips when hosts.lpd does not exist", () => {
    expect(evaluateU29([task("U-29: hosts.lpd owner and mode", "__MISSING__")]).status).toBe("skip");
  });

  it("passes for root:root 600", () => {
    expect(evaluateU29([task("U-29: hosts.lpd owner and mode", "root:root 600\n")]).status).toBe("pass");
  });

  it("fails when group/other has write permission", () => {
    expect(evaluateU29([task("U-29: hosts.lpd owner and mode", "root:root 622\n")]).status).toBe("fail");
  });
});

describe("evaluateU30", () => {
  it("skips when no umask-configuring file exists", () => {
    expect(evaluateU30([task("U-30: UMASK setting", "__MISSING__")]).status).toBe("skip");
  });

  it("fails when no umask directive is set", () => {
    expect(evaluateU30([task("U-30: UMASK setting", "")]).status).toBe("fail");
  });

  it("passes with umask 022", () => {
    expect(evaluateU30([task("U-30: UMASK setting", "UMASK 022\n")]).status).toBe("pass");
  });

  it("passes with a stricter umask 027", () => {
    expect(evaluateU30([task("U-30: UMASK setting", "umask 027\n")]).status).toBe("pass");
  });

  it("fails with a permissive umask 002", () => {
    expect(evaluateU30([task("U-30: UMASK setting", "umask 002\n")]).status).toBe("fail");
  });
});

describe("evaluateU31", () => {
  it("skips when /etc/passwd does not exist", () => {
    expect(evaluateU31([task("U-31: home directory owner and mode", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when interactive accounts own a safe home directory", () => {
    const result = evaluateU31([
      task(
        "U-31: home directory owner and mode",
        "root:/bin/bash:root 700\ndaemon:/usr/sbin/nologin:root 777\n",
      ),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when an interactive account's home is group/other writable", () => {
    const result = evaluateU31([task("U-31: home directory owner and mode", "nhit:/bin/bash:nhit 777\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("nhit");
  });

  it("fails when the home directory owner does not match the account", () => {
    const result = evaluateU31([task("U-31: home directory owner and mode", "nhit:/bin/bash:root 700\n")]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU32", () => {
  it("skips when /etc/passwd does not exist", () => {
    expect(evaluateU32([task("U-32: assigned home directory existence", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when every login account's home directory exists", () => {
    expect(evaluateU32([task("U-32: assigned home directory existence", "")]).status).toBe("pass");
  });

  it("ignores nologin system accounts with a missing home", () => {
    const result = evaluateU32([
      task("U-32: assigned home directory existence", "_apt:42:/nonexistent:/usr/sbin/nologin\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when an interactive account's home directory is missing", () => {
    const result = evaluateU32([
      task("U-32: assigned home directory existence", "nhit:1000:/home/nhit:/bin/bash\n"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("nhit");
  });
});

describe("evaluateU33", () => {
  it("passes when no hidden files are found", () => {
    expect(evaluateU33([task("U-33: hidden files and directories", "")]).status).toBe("pass");
  });

  it("ignores standard shell dotfiles", () => {
    const result = evaluateU33([
      task("U-33: hidden files and directories", "/root/.bashrc\n/root/.profile\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when a suspiciously named hidden file is found", () => {
    const result = evaluateU33([task("U-33: hidden files and directories", "/tmp/...\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("/tmp/...");
  });
});

describe("evaluateU34", () => {
  it("skips when finger is not installed", () => {
    expect(evaluateU34([task("U-34: finger service presence", "")]).status).toBe("skip");
  });

  it("fails when a finger daemon binary is found", () => {
    const result = evaluateU34([task("U-34: finger service presence", "BIN:fingerd\n")]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("fingerd");
  });
});

describe("evaluateU35", () => {
  it("skips when neither Samba nor NFS is present", () => {
    expect(evaluateU35([task("U-35: shared service anonymous access", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when present but no anonymous-access lines match", () => {
    expect(evaluateU35([task("U-35: shared service anonymous access", "")]).status).toBe("pass");
  });

  it("fails when Samba guest access is enabled", () => {
    const result = evaluateU35([task("U-35: shared service anonymous access", "SMB:guest ok = yes\n")]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU36", () => {
  it("skips when no r-series service is found", () => {
    expect(evaluateU36([task("U-36: r-series services (rsh/rlogin/rexec)", "")]).status).toBe("skip");
  });

  it("fails when rlogind is found", () => {
    expect(evaluateU36([task("U-36: r-series services (rsh/rlogin/rexec)", "BIN:rlogind\n")]).status).toBe(
      "fail",
    );
  });
});

describe("evaluateU37", () => {
  it("skips when no crontab files exist", () => {
    expect(
      evaluateU37([task("U-37: crontab configuration file permissions", "__MISSING__")]).status,
    ).toBe("skip");
  });

  it("passes when crontab files are root-owned with a safe mode", () => {
    const result = evaluateU37([
      task("U-37: crontab configuration file permissions", "FILE /etc/crontab root:root 600\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when a crontab file is group/other writable", () => {
    const result = evaluateU37([
      task("U-37: crontab configuration file permissions", "FILE /etc/crontab root:root 666\n"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("passes for the Debian default root:crontab 1730 (trusted setgid group)", () => {
    const result = evaluateU37([
      task(
        "U-37: crontab configuration file permissions",
        "FILE /var/spool/cron/crontabs root:crontab 1730\n",
      ),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when root:crontab is also world-writable", () => {
    const result = evaluateU37([
      task(
        "U-37: crontab configuration file permissions",
        "FILE /var/spool/cron/crontabs root:crontab 1737\n",
      ),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU38", () => {
  it("skips when no DoS-prone inetd services exist", () => {
    expect(
      evaluateU38([task("U-38: DoS-prone inetd services (echo/discard/daytime/chargen)", "__MISSING__")])
        .status,
    ).toBe("skip");
  });

  it("passes when the service entries are present but disabled", () => {
    const result = evaluateU38([
      task("U-38: DoS-prone inetd services (echo/discard/daytime/chargen)", "PRESENT:echo\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when a service entry is active", () => {
    const result = evaluateU38([
      task("U-38: DoS-prone inetd services (echo/discard/daytime/chargen)", "ACTIVE:chargen\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU39", () => {
  it("skips when no NFS service is found", () => {
    expect(evaluateU39([task("U-39: unnecessary NFS service", "")]).status).toBe("skip");
  });

  it("fails when an NFS daemon binary is found", () => {
    expect(evaluateU39([task("U-39: unnecessary NFS service", "BIN:rpc.nfsd\n")]).status).toBe("fail");
  });
});

describe("evaluateU40", () => {
  it("skips when /etc/exports does not exist", () => {
    expect(evaluateU40([task("U-40: NFS export access control", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when there are no export entries", () => {
    expect(evaluateU40([task("U-40: NFS export access control", "")]).status).toBe("pass");
  });

  it("passes when exports restrict the client", () => {
    const result = evaluateU40([
      task("U-40: NFS export access control", "/srv/nfs 192.168.1.0/24(ro,sync)\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when an export uses a wildcard client", () => {
    const result = evaluateU40([task("U-40: NFS export access control", "/srv/nfs *(rw,sync)\n")]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU41", () => {
  it("skips when automountd is not found", () => {
    expect(evaluateU41([task("U-41: unnecessary automountd", "")]).status).toBe("skip");
  });

  it("fails when automount is found", () => {
    expect(evaluateU41([task("U-41: unnecessary automountd", "BIN:automount\n")]).status).toBe("fail");
  });
});

describe("evaluateU42", () => {
  it("skips when no RPC service is found", () => {
    expect(evaluateU42([task("U-42: unnecessary RPC services", "")]).status).toBe("skip");
  });

  it("fails when rpcbind is found", () => {
    expect(evaluateU42([task("U-42: unnecessary RPC services", "BIN:rpcbind\n")]).status).toBe("fail");
  });
});

describe("evaluateU43", () => {
  it("skips when no NIS service is found", () => {
    expect(evaluateU43([task("U-43: NIS/NIS+ service", "")]).status).toBe("skip");
  });

  it("fails when ypbind is found", () => {
    expect(evaluateU43([task("U-43: NIS/NIS+ service", "BIN:ypbind\n")]).status).toBe("fail");
  });
});

describe("evaluateU44", () => {
  it("skips when neither tftp nor talk is found", () => {
    expect(evaluateU44([task("U-44: tftp/talk services", "")]).status).toBe("skip");
  });

  it("fails when tftpd is found", () => {
    expect(evaluateU44([task("U-44: tftp/talk services", "BIN:tftpd\n")]).status).toBe("fail");
  });
});

describe("evaluateU45", () => {
  it("skips when no mail service is detected", () => {
    expect(evaluateU45(mailTasks(null)).status).toBe("skip");
  });

  it("returns review when a mail service is present, regardless of version", () => {
    const result = evaluateU45([
      ...mailTasks("postfix"),
      task("U-45: mail service version", "postfix mail_version = 3.7.2\n"),
    ]);
    expect(result.status).toBe("review");
    expect(result.evidence).toContain("postfix");
  });
});

describe("evaluateU46", () => {
  it("skips when no mail service is detected", () => {
    expect(evaluateU46(mailTasks(null)).status).toBe("skip");
  });

  it("passes for postfix (queue access restricted by default)", () => {
    expect(evaluateU46(mailTasks("postfix")).status).toBe("pass");
  });

  it("passes for sendmail with restrictqrun set", () => {
    const result = evaluateU46([
      ...mailTasks("sendmail"),
      task("U-46: mail queue access restriction", "O PrivacyOptions=restrictqrun\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails for sendmail without restrictqrun", () => {
    const result = evaluateU46([...mailTasks("sendmail"), task("U-46: mail queue access restriction", "")]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU47", () => {
  it("skips when no mail service is detected", () => {
    expect(evaluateU47(mailTasks(null)).status).toBe("skip");
  });

  it("fails when postfix mynetworks is a fully open relay", () => {
    const result = evaluateU47([
      ...mailTasks("postfix"),
      task("U-47: mail relay restriction", "mynetworks = 0.0.0.0/0\n"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("passes when postfix mynetworks is scoped", () => {
    const result = evaluateU47([
      ...mailTasks("postfix"),
      task("U-47: mail relay restriction", "mynetworks = 127.0.0.0/8\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails for sendmail with no relay access control", () => {
    const result = evaluateU47([...mailTasks("sendmail"), task("U-47: mail relay restriction", "")]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU48", () => {
  it("skips when no mail service is detected", () => {
    expect(evaluateU48(mailTasks(null)).status).toBe("skip");
  });

  it("passes when postfix disables the VRFY command", () => {
    const result = evaluateU48([
      ...mailTasks("postfix"),
      task("U-48: SMTP EXPN/VRFY command restriction", "disable_vrfy_command = yes\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when postfix leaves VRFY at its default", () => {
    const result = evaluateU48([
      ...mailTasks("postfix"),
      task("U-48: SMTP EXPN/VRFY command restriction", ""),
    ]);
    expect(result.status).toBe("fail");
  });

  it("passes for sendmail with noexpn and novrfy set", () => {
    const result = evaluateU48([
      ...mailTasks("sendmail"),
      task("U-48: SMTP EXPN/VRFY command restriction", "O PrivacyOptions=noexpn,novrfy\n"),
    ]);
    expect(result.status).toBe("pass");
  });
});

describe("evaluateU49", () => {
  it("skips when DNS (BIND) is not detected", () => {
    expect(evaluateU49(dnsTasks(false, null)).status).toBe("skip");
  });

  it("returns review when BIND is present, regardless of version", () => {
    const result = evaluateU49([
      ...dnsTasks(true, null),
      task("U-49: DNS service version", "BIND 9.18.1\n"),
    ]);
    expect(result.status).toBe("review");
  });
});

describe("evaluateU50", () => {
  it("skips when DNS (BIND) is not detected", () => {
    expect(evaluateU50(dnsTasks(false, null)).status).toBe("skip");
  });

  it("fails when allow-transfer is not configured", () => {
    expect(evaluateU50(dnsTasks(true, "options {\n};\n")).status).toBe("fail");
  });

  it("fails when allow-transfer allows any host", () => {
    expect(evaluateU50(dnsTasks(true, "allow-transfer { any; };\n")).status).toBe("fail");
  });

  it("passes when allow-transfer is scoped to specific hosts", () => {
    expect(evaluateU50(dnsTasks(true, "allow-transfer { 10.0.0.1; };\n")).status).toBe("pass");
  });
});

describe("evaluateU51", () => {
  it("skips when DNS (BIND) is not detected", () => {
    expect(evaluateU51(dnsTasks(false, null)).status).toBe("skip");
  });

  it("passes when allow-update is not configured (dynamic update disabled by default)", () => {
    expect(evaluateU51(dnsTasks(true, "options {\n};\n")).status).toBe("pass");
  });

  it("fails when allow-update allows any host", () => {
    expect(evaluateU51(dnsTasks(true, "allow-update { any; };\n")).status).toBe("fail");
  });
});

describe("evaluateU52", () => {
  it("skips when telnetd is not found", () => {
    expect(evaluateU52([task("U-52: telnet service", "")]).status).toBe("skip");
  });

  it("fails when telnetd is found", () => {
    expect(evaluateU52([task("U-52: telnet service", "BIN:telnetd\n")]).status).toBe("fail");
  });
});

describe("evaluateU53", () => {
  it("skips when no FTP server is detected", () => {
    expect(evaluateU53(ftpTasks(null, null)).status).toBe("skip");
  });

  it("fails when present but the config can't be read", () => {
    expect(evaluateU53(ftpTasks("vsftpd", null)).status).toBe("fail");
  });

  it("passes when a custom vsftpd banner is set", () => {
    expect(evaluateU53(ftpTasks("vsftpd", "ftpd_banner=Authorized use only\n")).status).toBe("pass");
  });

  it("fails when the default vsftpd banner is left in place", () => {
    expect(evaluateU53(ftpTasks("vsftpd", "anonymous_enable=NO\n")).status).toBe("fail");
  });
});

describe("evaluateU54", () => {
  it("skips when no FTP server is detected", () => {
    expect(evaluateU54(ftpTasks(null, null)).status).toBe("skip");
  });

  it("passes when vsftpd has TLS enabled", () => {
    expect(evaluateU54(ftpTasks("vsftpd", "ssl_enable=YES\n")).status).toBe("pass");
  });

  it("fails when vsftpd has no TLS configuration", () => {
    expect(evaluateU54(ftpTasks("vsftpd", "anonymous_enable=NO\n")).status).toBe("fail");
  });
});

describe("evaluateU55", () => {
  it("skips when no FTP server is detected", () => {
    expect(evaluateU55(ftpTasks(null, null)).status).toBe("skip");
  });

  it("passes when there is no ftp system account", () => {
    const result = evaluateU55([
      ...ftpTasks("vsftpd", ""),
      task("U-55: FTP account shell restriction", "__MISSING__"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("passes when the ftp account uses nologin", () => {
    const result = evaluateU55([
      ...ftpTasks("vsftpd", ""),
      task("U-55: FTP account shell restriction", "ftp:x:14:50:FTP User:/var/ftp:/sbin/nologin\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when the ftp account has an interactive shell", () => {
    const result = evaluateU55([
      ...ftpTasks("vsftpd", ""),
      task("U-55: FTP account shell restriction", "ftp:x:14:50:FTP User:/var/ftp:/bin/bash\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU56", () => {
  it("skips when no FTP server is detected", () => {
    expect(evaluateU56(ftpTasks(null, null)).status).toBe("skip");
  });

  it("passes when vsftpd has tcp_wrappers enabled", () => {
    expect(evaluateU56(ftpTasks("vsftpd", "tcp_wrappers=YES\n")).status).toBe("pass");
  });

  it("fails when no access-control directive is present", () => {
    expect(evaluateU56(ftpTasks("vsftpd", "anonymous_enable=NO\n")).status).toBe("fail");
  });
});

describe("evaluateU57", () => {
  it("skips when no FTP server is detected", () => {
    expect(evaluateU57(ftpTasks(null, null)).status).toBe("skip");
  });

  it("fails when no ftpusers file exists", () => {
    const result = evaluateU57([
      ...ftpTasks("vsftpd", ""),
      task("U-57: ftpusers file configuration", "__MISSING__"),
    ]);
    expect(result.status).toBe("fail");
  });

  it("passes when root is listed in ftpusers", () => {
    const result = evaluateU57([
      ...ftpTasks("vsftpd", ""),
      task("U-57: ftpusers file configuration", "FILE:/etc/ftpusers\nroot\nbin\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when root is not listed in ftpusers", () => {
    const result = evaluateU57([
      ...ftpTasks("vsftpd", ""),
      task("U-57: ftpusers file configuration", "FILE:/etc/ftpusers\nbin\n"),
    ]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU58", () => {
  it("skips when SNMP is not detected", () => {
    expect(evaluateU58(snmpTasks(false, null)).status).toBe("skip");
  });

  it("fails when SNMP is detected (presence itself is the finding)", () => {
    expect(evaluateU58(snmpTasks(true, null)).status).toBe("fail");
  });
});

describe("evaluateU59", () => {
  it("skips when SNMP is not detected", () => {
    expect(evaluateU59(snmpTasks(false, null)).status).toBe("skip");
  });

  it("fails when v1/v2c community strings are configured", () => {
    expect(evaluateU59(snmpTasks(true, "rocommunity public\n")).status).toBe("fail");
  });

  it("passes when only SNMPv3 users are configured", () => {
    expect(evaluateU59(snmpTasks(true, "createUser admin SHA authpass AES privpass\nrouser admin\n")).status).toBe(
      "pass",
    );
  });
});

describe("evaluateU60", () => {
  it("skips when SNMP is not detected", () => {
    expect(evaluateU60(snmpTasks(false, null)).status).toBe("skip");
  });

  it("passes when no community strings are configured", () => {
    expect(evaluateU60(snmpTasks(true, "createUser admin SHA authpass\n")).status).toBe("pass");
  });

  it("fails when a default community string (public/private) is used", () => {
    expect(evaluateU60(snmpTasks(true, "rocommunity public\n")).status).toBe("fail");
  });

  it("passes when a non-default community string is used", () => {
    expect(evaluateU60(snmpTasks(true, "rocommunity S3cur3-Str1ng\n")).status).toBe("pass");
  });
});

describe("evaluateU61", () => {
  it("skips when SNMP is not detected", () => {
    expect(evaluateU61(snmpTasks(false, null)).status).toBe("skip");
  });

  it("fails when no com2sec/community source restriction is configured", () => {
    expect(evaluateU61(snmpTasks(true, "")).status).toBe("fail");
  });

  it("fails when the community source is unrestricted (default)", () => {
    expect(evaluateU61(snmpTasks(true, "com2sec notConfigUser default public\n")).status).toBe("fail");
  });

  it("passes when the community source is scoped to a specific network", () => {
    expect(evaluateU61(snmpTasks(true, "com2sec readonly 10.0.0.0/24 public\n")).status).toBe("pass");
  });
});

describe("evaluateU62", () => {
  it("fails when both issue.net and issue are empty", () => {
    expect(evaluateU62([task("U-62: login warning banner", "__ISSUE_NET__\n__ISSUE__\n")]).status).toBe(
      "fail",
    );
  });

  it("passes when issue.net has a custom warning banner", () => {
    const result = evaluateU62([
      task(
        "U-62: login warning banner",
        "__ISSUE_NET__\nUnauthorized access is prohibited.\n__ISSUE__\n",
      ),
    ]);
    expect(result.status).toBe("pass");
  });
});

describe("evaluateU63", () => {
  it("skips when /etc/sudoers does not exist", () => {
    expect(evaluateU63([task("U-63: sudo command access management", "__MISSING__")]).status).toBe("skip");
  });

  it("passes with only standard root/admin-group grants", () => {
    const result = evaluateU63([
      task(
        "U-63: sudo command access management",
        "root ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL\n",
      ),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when a non-admin user has NOPASSWD:ALL", () => {
    const result = evaluateU63([
      task("U-63: sudo command access management", "root ALL=(ALL:ALL) ALL\nappuser ALL=(ALL) NOPASSWD:ALL\n"),
    ]);
    expect(result.status).toBe("fail");
    expect(result.evidence).toContain("appuser");
  });
});

describe("evaluateU64", () => {
  it("always returns review, since patch recency can't be verified from a static image", () => {
    const result = evaluateU64([task("U-64: periodic security patch application", "PKG:apt/dpkg\n")]);
    expect(result.status).toBe("review");
    expect(result.evidence).toContain("apt/dpkg");
  });
});

describe("evaluateU65", () => {
  it("skips when no NTP/time-sync service is detected", () => {
    expect(evaluateU65([task("U-65: NTP and time synchronization", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when chrony has a server configured", () => {
    const result = evaluateU65([
      task("U-65: NTP and time synchronization", "__CHRONY__\nserver time.google.com iburst\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when present but no time source is configured", () => {
    const result = evaluateU65([task("U-65: NTP and time synchronization", "__CHRONY__\n")]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU66", () => {
  it("skips when no syslog configuration exists", () => {
    expect(evaluateU66([task("U-66: system logging policy", "__MISSING__")]).status).toBe("skip");
  });

  it("passes when an active logging rule is configured", () => {
    const result = evaluateU66([
      task("U-66: system logging policy", "auth,authpriv.*\t/var/log/auth.log\n"),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails when present but no active logging rule exists", () => {
    const result = evaluateU66([task("U-66: system logging policy", "# auth,authpriv.* /var/log/auth.log\n")]);
    expect(result.status).toBe("fail");
  });
});

describe("evaluateU67", () => {
  it("skips when /var/log does not exist", () => {
    expect(evaluateU67([task("U-67: log directory ownership and permissions", "__MISSING__")]).status).toBe(
      "skip",
    );
  });

  it("passes for root:root 755", () => {
    expect(evaluateU67([task("U-67: log directory ownership and permissions", "root:root 755\n")]).status).toBe(
      "pass",
    );
  });

  it("fails when /var/log is world-writable", () => {
    expect(evaluateU67([task("U-67: log directory ownership and permissions", "root:root 777\n")]).status).toBe(
      "fail",
    );
  });
});

describe("evaluateW26", () => {
  it("skips when nginx is not detected", () => {
    expect(evaluateW26(nginxTasks(null)).status).toBe("skip");
  });

  it("passes when server_tokens off is set", () => {
    expect(evaluateW26(nginxTasks("http {\n  server_tokens off;\n}\n")).status).toBe("pass");
  });

  it("fails when server_tokens is left at its default (on)", () => {
    expect(evaluateW26(nginxTasks("http {}\n")).status).toBe("fail");
  });
});

describe("evaluateIisOnly", () => {
  it("always returns skip regardless of id, since IIS never applies to a Linux container", () => {
    for (const id of ["W-11", "W-12", "W-13", "W-14", "W-15", "W-16", "W-17", "W-18", "W-19"]) {
      const result = evaluateIisOnly(id);
      expect(result).toEqual({ id, status: "skip", evidence: "IIS 전용 항목 — Linux 컨테이너에는 해당 없음" });
    }
  });
});
