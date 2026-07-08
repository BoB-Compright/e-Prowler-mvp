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
  evaluateU16,
} from "./ruleEvaluation";
import type { AnsibleTaskOutput } from "./ansibleRunner";
import type { DockerfileFindings } from "./dockerfileChecks";

function task(taskName: string, stdout: string): AnsibleTaskOutput {
  return { taskName, stdout };
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
