import type { DockerfileFindings } from "./dockerfileChecks";
import type { AnsibleTaskOutput } from "./ansibleRunner";
import { findTaskOutput } from "./ansibleRunner";
import type { CheckResult } from "./types";

const MISSING_MARKER = "__MISSING__";

export function evaluateC01(
  findings: DockerfileFindings,
  tasks: AnsibleTaskOutput[],
): CheckResult {
  const uid = findTaskOutput(tasks, "C-01")?.stdout.trim() ?? "";
  const isRootUid = uid === "0";
  const fail = isRootUid || !findings.hasUserInstruction;

  return {
    id: "C-01",
    status: fail ? "fail" : "pass",
    evidence: `Dockerfile USER 지시어: ${findings.hasUserInstruction ? "있음" : "없음"} / 실행 컨테이너 UID: ${uid || "확인 불가"}`,
  };
}

export function evaluateC02(findings: DockerfileFindings): CheckResult {
  if (findings.hardcodedSecretVars.length === 0) {
    return { id: "C-02", status: "pass", evidence: "ENV/ARG에서 시크릿 패턴이 발견되지 않음" };
  }
  return {
    id: "C-02",
    status: "fail",
    evidence: `ENV/ARG에서 시크릿으로 보이는 변수 발견 (값은 마스킹): ${findings.hardcodedSecretVars.join(", ")}`,
  };
}

const ADMIN_DB_PORTS = new Set(["22", "3306", "5432", "6379", "27017", "1433", "9200", "11211"]);

function extractListeningPorts(output: string): Set<string> {
  const ports = new Set<string>();
  for (const match of output.matchAll(/:(\d+)\b/g)) {
    ports.add(match[1]);
  }
  return ports;
}

export function evaluateC03(
  findings: DockerfileFindings,
  tasks: AnsibleTaskOutput[],
): CheckResult {
  const exposedAdminPorts = findings.exposedPorts.filter((port) => ADMIN_DB_PORTS.has(port));

  const rawOutput = findTaskOutput(tasks, "C-03")?.stdout.trim() ?? "";
  const listeningPorts =
    rawOutput && rawOutput !== MISSING_MARKER ? extractListeningPorts(rawOutput) : new Set<string>();
  const listeningAdminPorts = [...listeningPorts].filter((port) => ADMIN_DB_PORTS.has(port));

  const fail = exposedAdminPorts.length > 0 || listeningAdminPorts.length > 0;
  const foundAdminPorts = [...new Set([...exposedAdminPorts, ...listeningAdminPorts])];

  return {
    id: "C-03",
    status: fail ? "fail" : "pass",
    evidence:
      `EXPOSE 포트: ${findings.exposedPorts.join(", ") || "없음"} / ` +
      `실행 중 리스닝 포트: ${listeningPorts.size ? [...listeningPorts].join(", ") : "확인 불가"}` +
      (fail ? ` / 관리·DB 포트 발견: ${foundAdminPorts.join(", ")}` : ""),
  };
}

export function evaluateC04(findings: DockerfileFindings): CheckResult {
  const unpinned = findings.baseImages.filter((image) => !image.pinned);
  const describe = (image: DockerfileFindings["baseImages"][number]) =>
    image.tag ? `${image.image}:${image.tag}` : image.image;

  if (unpinned.length === 0) {
    return {
      id: "C-04",
      status: "pass",
      evidence: `모든 base 이미지 태그 고정됨: ${findings.baseImages.map(describe).join(", ") || "base 이미지 없음"}`,
    };
  }
  return {
    id: "C-04",
    status: "fail",
    evidence: `태그 미고정 base 이미지: ${unpinned.map(describe).join(", ")}`,
  };
}

const DANGEROUS_PACKAGE_MARKERS = ["curl", "wget", "gcc", "cc", "make", "apt", "apt-get"];

export function evaluateC05(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "C-05")?.stdout.trim() ?? "";
  const found = stdout && stdout !== MISSING_MARKER
    ? stdout.split("\n").map((line) => line.trim()).filter((line) => DANGEROUS_PACKAGE_MARKERS.includes(line))
    : [];

  if (found.length === 0) {
    return { id: "C-05", status: "pass", evidence: "위험 패키지가 발견되지 않음" };
  }
  return { id: "C-05", status: "fail", evidence: `잔존 위험 패키지: ${found.join(", ")}` };
}

// Setuid/setgid binaries shipped by common base-image package managers
// (shadow-utils, util-linux, iputils, openssh) that don't indicate misconfiguration.
const EXPECTED_SETUID_BINARIES = new Set([
  "/usr/bin/passwd",
  "/bin/passwd",
  "/usr/bin/chsh",
  "/usr/bin/chfn",
  "/usr/bin/chage",
  "/usr/bin/gpasswd",
  "/usr/bin/newgrp",
  "/usr/bin/su",
  "/bin/su",
  "/usr/bin/sudo",
  "/usr/bin/mount",
  "/bin/mount",
  "/usr/bin/umount",
  "/bin/umount",
  "/usr/bin/ping",
  "/bin/ping",
  "/usr/lib/openssh/ssh-keysign",
]);

export function evaluateC06(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "C-06")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "C-06", status: "pass", evidence: "setuid/setgid 바이너리가 발견되지 않음" };
  }

  const found = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const unexpected = found.filter((path) => !EXPECTED_SETUID_BINARIES.has(path));

  if (unexpected.length === 0) {
    return {
      id: "C-06",
      status: "pass",
      evidence: found.length ? `표준 setuid 바이너리만 존재: ${found.join(", ")}` : "setuid/setgid 바이너리가 발견되지 않음",
    };
  }
  return { id: "C-06", status: "fail", evidence: `예상 외 setuid/setgid 바이너리: ${unexpected.join(", ")}` };
}

export function evaluateC07(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "C-07")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "C-07", status: "skip", evidence: "루트 마운트 옵션을 확인할 수 없음" };
  }

  // /proc/mounts line: "<device> <mountpoint> <fstype> <options> <freq> <passno>".
  const options = (stdout.split(/\s+/)[3] ?? "").split(",");
  const isReadOnly = options.includes("ro");

  return {
    id: "C-07",
    status: isReadOnly ? "pass" : "fail",
    evidence: isReadOnly
      ? "루트 파일시스템이 읽기 전용(ro)으로 마운트됨"
      : "루트 파일시스템이 쓰기 가능(rw)하게 마운트됨 (--read-only 미적용)",
  };
}

export function evaluateC08(findings: DockerfileFindings): CheckResult {
  return {
    id: "C-08",
    status: findings.hasHealthcheck ? "pass" : "fail",
    evidence: findings.hasHealthcheck ? "HEALTHCHECK 지시어 존재" : "HEALTHCHECK 지시어 없음",
  };
}

export function evaluateC09(findings: DockerfileFindings): CheckResult {
  if (findings.remoteAddSources.length === 0) {
    return { id: "C-09", status: "pass", evidence: "원격 URL을 사용하는 ADD 지시어 없음" };
  }
  return {
    id: "C-09",
    status: "fail",
    evidence: `원격 URL ADD 사용: ${findings.remoteAddSources.join(", ")}`,
  };
}

// A line is "active" (not a comment, not blank) — used across the U-0x
// checks since Ansible only forwards raw file content/grep matches and
// commented-out directives don't count as configured.
function isActiveLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith("#");
}

export function evaluateU01(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-01")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-01", status: "skip", evidence: "sshd_config가 존재하지 않음 (sshd 미사용)" };
  }

  const activeLines = stdout.split("\n").filter(isActiveLine);
  if (activeLines.length === 0) {
    return {
      id: "U-01",
      status: "fail",
      evidence: "PermitRootLogin 설정이 없어 기본값(root 원격 로그인 허용 가능)으로 남아있음",
    };
  }
  const value = activeLines[activeLines.length - 1].trim().split(/\s+/)[1]?.toLowerCase() ?? "";
  return {
    id: "U-01",
    status: value === "yes" ? "fail" : "pass",
    evidence: `PermitRootLogin ${value || "확인 불가"}`,
  };
}

export function evaluateU02(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-02")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-02", status: "skip", evidence: "/etc/login.defs가 존재하지 않음" };
  }

  const activeLines = stdout.split("\n").filter(isActiveLine);
  const maxDays = activeLines.find((line) => /PASS_MAX_DAYS/.test(line))?.trim().split(/\s+/)[1];
  const minLen = activeLines.find((line) => /PASS_MIN_LEN/.test(line))?.trim().split(/\s+/)[1];
  const maxDaysNum = Number(maxDays);
  const minLenNum = Number(minLen);
  const fail = !(maxDaysNum > 0 && maxDaysNum <= 90) || !(minLenNum >= 8);

  return {
    id: "U-02",
    status: fail ? "fail" : "pass",
    evidence: `PASS_MAX_DAYS=${maxDays ?? "미설정"}, PASS_MIN_LEN=${minLen ?? "미설정"}`,
  };
}

export function evaluateU03(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-03")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-03", status: "skip", evidence: "PAM 인증 설정 파일이 존재하지 않음" };
  }

  const hasLockoutModule = stdout
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /pam_tally2|pam_faillock/.test(line));

  return {
    id: "U-03",
    status: hasLockoutModule ? "pass" : "fail",
    evidence: hasLockoutModule
      ? "계정 잠금 PAM 모듈(pam_tally2/pam_faillock) 설정됨"
      : "계정 잠금 PAM 모듈이 설정되어 있지 않음",
  };
}

export function evaluateU04(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-04")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-04", status: "skip", evidence: "/etc/passwd가 존재하지 않음" };
  }

  const exposed = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((field) => field && !["x", "*", "!"].includes(field));

  return {
    id: "U-04",
    status: exposed.length === 0 ? "pass" : "fail",
    evidence:
      exposed.length === 0
        ? "/etc/passwd에 실제 비밀번호 해시가 없음 (shadow 분리됨)"
        : "/etc/passwd에 비밀번호 필드가 노출됨 (shadow 미분리)",
  };
}

export function evaluateU05(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-05")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-05", status: "skip", evidence: "/etc/passwd가 존재하지 않음" };
  }

  const extra = stdout
    .split("\n")
    .map((line) => line.trim().split(":"))
    .filter(([, uid]) => uid === "0")
    .map(([name]) => name)
    .filter((name) => name !== "root");

  return {
    id: "U-05",
    status: extra.length === 0 ? "pass" : "fail",
    evidence: extra.length === 0 ? "UID 0 계정은 root뿐임" : `root 외 UID 0 계정 발견: ${extra.join(", ")}`,
  };
}

export function evaluateU06(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-06")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-06", status: "skip", evidence: "/etc/pam.d/su가 존재하지 않음" };
  }

  const hasActiveWheelRule = stdout
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /pam_wheel/.test(line));

  return {
    id: "U-06",
    status: hasActiveWheelRule ? "pass" : "fail",
    evidence: hasActiveWheelRule ? "su 사용이 pam_wheel로 그룹 제한됨" : "su 사용을 제한하는 pam_wheel 설정이 없음",
  };
}

const UNNECESSARY_ACCOUNTS = new Set([
  "games",
  "news",
  "uucp",
  "lp",
  "sync",
  "shutdown",
  "halt",
  "operator",
  "ftp",
  "gopher",
  "irc",
  "gnats",
]);

export function evaluateU07(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-07")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-07", status: "skip", evidence: "/etc/passwd가 존재하지 않음" };
  }

  const found = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => UNNECESSARY_ACCOUNTS.has(name));

  return {
    id: "U-07",
    status: found.length === 0 ? "pass" : "fail",
    evidence: found.length === 0 ? "불필요한 기본 계정이 없음" : `불필요한 기본 계정 잔존: ${found.join(", ")}`,
  };
}

export function evaluateU08(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-08")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-08", status: "skip", evidence: "root/wheel/sudo 그룹이 정의되어 있지 않음" };
  }

  const extraMembers: string[] = [];
  for (const line of stdout.split("\n").filter(isActiveLine)) {
    const fields = line.trim().split(":");
    // Some distros (e.g. Alpine) conventionally list root itself as a member
    // of its own admin groups — that's not an "extra" account.
    const members = (fields[3] ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter((member) => member && member !== "root");
    if (members.length > 0) extraMembers.push(`${fields[0]}:${members.join(",")}`);
  }

  return {
    id: "U-08",
    status: extraMembers.length === 0 ? "pass" : "fail",
    evidence:
      extraMembers.length === 0
        ? "관리자 그룹(root/wheel/sudo)에 추가 계정이 없음"
        : `관리자 그룹 추가 계정 발견: ${extraMembers.join(" / ")}`,
  };
}

export function evaluateU09(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-09")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-09", status: "skip", evidence: "/etc/passwd 또는 /etc/group이 존재하지 않음" };
  }

  const [, passwdSection = "", groupSection = ""] = stdout.split(/__PASSWD__|__GROUP__/);
  const passwdGids = new Set(passwdSection.split("\n").map((line) => line.trim()).filter(Boolean));
  const groupGids = new Set(groupSection.split("\n").map((line) => line.trim()).filter(Boolean));
  const orphanGids = [...passwdGids].filter((gid) => !groupGids.has(gid));

  return {
    id: "U-09",
    status: orphanGids.length === 0 ? "pass" : "fail",
    evidence:
      orphanGids.length === 0
        ? "모든 계정의 GID가 /etc/group에 존재함"
        : `/etc/group에 없는 GID 사용: ${orphanGids.join(", ")}`,
  };
}

export function evaluateU10(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-10")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-10", status: "skip", evidence: "/etc/passwd가 존재하지 않음" };
  }

  const counts = new Map<string, number>();
  for (const uid of stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()].filter(([, count]) => count > 1).map(([uid]) => uid);

  return {
    id: "U-10",
    status: duplicated.length === 0 ? "pass" : "fail",
    evidence: duplicated.length === 0 ? "중복 UID 없음" : `중복 UID 발견: ${duplicated.join(", ")}`,
  };
}

// System/service accounts (0 < UID < 1000) shouldn't have a usable login shell.
const NOLOGIN_SHELLS = new Set([
  "/sbin/nologin",
  "/usr/sbin/nologin",
  "/bin/false",
  "/usr/bin/false",
  // Non-interactive placeholder commands Debian/Alpine ship by default for
  // sync/shutdown/halt system accounts — not an actual login shell.
  "/bin/sync",
  "/usr/bin/sync",
  "/sbin/shutdown",
  "/usr/sbin/shutdown",
  "/sbin/halt",
  "/usr/sbin/halt",
  "",
]);

export function evaluateU11(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-11")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-11", status: "skip", evidence: "/etc/passwd가 존재하지 않음" };
  }

  const offenders: string[] = [];
  for (const line of stdout.split("\n")) {
    const [name, uid, shell] = line.trim().split(":");
    if (!name || uid === undefined) continue;
    const uidNum = Number(uid);
    const isSystemAccount = uidNum > 0 && uidNum < 1000;
    if (isSystemAccount && !NOLOGIN_SHELLS.has(shell ?? "")) {
      offenders.push(`${name}(${shell || "미설정"})`);
    }
  }

  return {
    id: "U-11",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "시스템 계정에 로그인 가능한 Shell이 없음"
        : `로그인 가능한 Shell을 가진 시스템 계정: ${offenders.join(", ")}`,
  };
}

export function evaluateU12(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-12")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-12", status: "skip", evidence: "/etc/profile가 존재하지 않음" };
  }

  const activeLines = stdout.split("\n").filter(isActiveLine).filter((line) => /TMOUT/.test(line));
  if (activeLines.length === 0) {
    return { id: "U-12", status: "fail", evidence: "TMOUT(세션 자동 종료) 설정이 없음" };
  }
  const value = Number(activeLines[0].split("=")[1]?.trim());
  const fail = !(value > 0 && value <= 600);

  return {
    id: "U-12",
    status: fail ? "fail" : "pass",
    evidence: `TMOUT=${Number.isNaN(value) ? "확인 불가" : value}`,
  };
}

const SECURE_HASH_ALGORITHMS = new Set(["SHA512", "SHA256", "YESCRYPT"]);

export function evaluateU13(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-13")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-13", status: "skip", evidence: "/etc/login.defs가 존재하지 않음" };
  }

  const activeLines = stdout.split("\n").filter(isActiveLine);
  if (activeLines.length === 0) {
    return { id: "U-13", status: "fail", evidence: "ENCRYPT_METHOD 설정이 없어 기본 알고리즘 사용 여부를 알 수 없음" };
  }
  const method = activeLines[activeLines.length - 1].trim().split(/\s+/)[1]?.toUpperCase() ?? "";

  return {
    id: "U-13",
    status: SECURE_HASH_ALGORITHMS.has(method) ? "pass" : "fail",
    evidence: `ENCRYPT_METHOD=${method || "확인 불가"}`,
  };
}

// KISA U-16: owner must be root:root, and neither group nor other should
// have write permission (mode <= 644-equivalent).
function isSafePasswdMode(mode: string): boolean {
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [group, other] = mode.slice(-3).split("").map(Number).slice(1);
  return (group & 2) === 0 && (other & 2) === 0;
}

export function evaluateU16(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-16")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return {
      id: "U-16",
      status: "skip",
      evidence: "대상 컨테이너에 /etc/passwd가 존재하지 않음",
    };
  }

  const [ownerGroup, mode] = stdout.split(/\s+/);
  const isRootOwned = ownerGroup === "root:root";
  const isSafeMode = isSafePasswdMode(mode ?? "");
  const fail = !isRootOwned || !isSafeMode;

  return {
    id: "U-16",
    status: fail ? "fail" : "pass",
    evidence: `소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}`,
  };
}

// Composition point: every check the pipeline runs gets added here (C/U/W).
export function evaluateAllChecks(
  findings: DockerfileFindings,
  tasks: AnsibleTaskOutput[],
): CheckResult[] {
  return [
    evaluateC01(findings, tasks),
    evaluateC02(findings),
    evaluateC03(findings, tasks),
    evaluateC04(findings),
    evaluateC05(tasks),
    evaluateC06(tasks),
    evaluateC07(tasks),
    evaluateC08(findings),
    evaluateC09(findings),
    evaluateU01(tasks),
    evaluateU02(tasks),
    evaluateU03(tasks),
    evaluateU04(tasks),
    evaluateU05(tasks),
    evaluateU06(tasks),
    evaluateU07(tasks),
    evaluateU08(tasks),
    evaluateU09(tasks),
    evaluateU10(tasks),
    evaluateU11(tasks),
    evaluateU12(tasks),
    evaluateU13(tasks),
    evaluateU16(tasks),
  ];
}
