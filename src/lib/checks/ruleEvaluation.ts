import type { DockerfileFindings } from "./dockerfileChecks";
import type { AnsibleTaskOutput } from "./ansibleRunner";
import { findTaskOutput } from "./ansibleRunner";
import type { CheckResult } from "./types";

const MISSING_MARKER = "__MISSING__";

// findings is null for the local-image fallback path (#41), where there is
// no Dockerfile to analyze — checks fall back to runtime-only evidence where
// possible (C-01, C-03) or skip where the check is Dockerfile-only.
export function evaluateC01(
  findings: DockerfileFindings | null,
  tasks: AnsibleTaskOutput[],
): CheckResult {
  const uid = findTaskOutput(tasks, "C-01")?.stdout.trim() ?? "";
  const isRootUid = uid === "0";
  const fail = isRootUid || (findings !== null && !findings.hasUserInstruction);

  return {
    id: "C-01",
    status: fail ? "fail" : "pass",
    evidence: `Dockerfile USER 지시어: ${findings === null ? "확인 불가 (Dockerfile 없음)" : findings.hasUserInstruction ? "있음" : "없음"} / 실행 컨테이너 UID: ${uid || "확인 불가"}`,
  };
}

export function evaluateC02(findings: DockerfileFindings | null): CheckResult {
  if (findings === null) {
    return { id: "C-02", status: "skip", evidence: "Dockerfile 정보 없음 (로컬 이미지 재점검)" };
  }
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
  findings: DockerfileFindings | null,
  tasks: AnsibleTaskOutput[],
): CheckResult {
  const exposedPorts = findings?.exposedPorts ?? [];
  const exposedAdminPorts = exposedPorts.filter((port) => ADMIN_DB_PORTS.has(port));

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
      `EXPOSE 포트: ${findings === null ? "확인 불가 (Dockerfile 없음)" : exposedPorts.join(", ") || "없음"} / ` +
      `실행 중 리스닝 포트: ${listeningPorts.size ? [...listeningPorts].join(", ") : "확인 불가"}` +
      (fail ? ` / 관리·DB 포트 발견: ${foundAdminPorts.join(", ")}` : ""),
  };
}

export function evaluateC04(findings: DockerfileFindings | null): CheckResult {
  if (findings === null) {
    return { id: "C-04", status: "skip", evidence: "Dockerfile 정보 없음 (로컬 이미지 재점검)" };
  }
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

export function evaluateC08(findings: DockerfileFindings | null): CheckResult {
  if (findings === null) {
    return { id: "C-08", status: "skip", evidence: "Dockerfile 정보 없음 (로컬 이미지 재점검)" };
  }
  return {
    id: "C-08",
    status: findings.hasHealthcheck ? "pass" : "fail",
    evidence: findings.hasHealthcheck ? "HEALTHCHECK 지시어 존재" : "HEALTHCHECK 지시어 없음",
  };
}

export function evaluateC09(findings: DockerfileFindings | null): CheckResult {
  if (findings === null) {
    return { id: "C-09", status: "skip", evidence: "Dockerfile 정보 없음 (로컬 이미지 재점검)" };
  }
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

// Shared by every U-1x/U-2x "owner + mode" check below (U-18..U-22, U-24,
// U-29, U-31): neither group nor other should have write permission. Same
// bit logic as isSafePasswdMode (U-16) but kept separate/generic since it's
// reused across many unrelated files/dirs, not just /etc/passwd.
function hasNoGroupOrOtherWrite(mode: string): boolean {
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [group, other] = mode.slice(-3).split("").map(Number).slice(1);
  return (group & 2) === 0 && (other & 2) === 0;
}

// U-18 (/etc/shadow) needs a stricter bar than hasNoGroupOrOtherWrite: only
// the owner (and optionally a trusted group, e.g. Debian's "shadow" group)
// should have any access at all — "other" must have zero permissions.
function isSafeShadowMode(mode: string): boolean {
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [group, other] = mode.slice(-3).split("").map(Number).slice(1);
  return other === 0 && (group & 2) === 0;
}

// Caps long file-list evidence (U-15/U-23/U-25/U-26/U-33 can each turn up
// many hits on a real image) so evidence strings stay readable.
function summarizeList(items: string[], max = 10): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} 외 ${items.length - max}건`;
}

export function evaluateU14(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-14")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-14", status: "skip", evidence: "대상 컨테이너에 /root 디렉터리가 존재하지 않음" };
  }

  const lines = stdout.split("\n").filter(Boolean);
  const [ownerGroup, mode] = (lines[0] ?? "").trim().split(/\s+/);
  const isRootOwned = ownerGroup === "root:root";
  const isSafeMode = hasNoGroupOrOtherWrite(mode ?? "");

  const pathLines = lines.slice(1).filter(isActiveLine);
  const pathValues = pathLines.map((line) => line.split("=").slice(1).join("=").trim());
  // "." (or an empty component, e.g. a leading/trailing/doubled ":") in PATH
  // means "current directory", which lets an attacker-planted binary in a
  // cwd shadow a real command.
  const hasCurrentDirInPath = pathValues.some((value) =>
    value.split(":").some((component) => component === "." || component === ""),
  );

  const fail = !isRootOwned || !isSafeMode || hasCurrentDirInPath;

  return {
    id: "U-14",
    status: fail ? "fail" : "pass",
    evidence:
      `root 홈 디렉터리 소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}` +
      (hasCurrentDirInPath ? " / PATH에 현재 디렉터리(.) 포함됨" : " / PATH에 현재 디렉터리 없음"),
  };
}

export function evaluateU15(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-15")?.stdout.trim() ?? "";
  const offenders = stdout ? stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];

  if (offenders.length === 0) {
    return { id: "U-15", status: "pass", evidence: "소유자/그룹이 없는 파일 또는 디렉터리가 없음" };
  }
  return {
    id: "U-15",
    status: "fail",
    evidence: `소유자 또는 그룹이 존재하지 않는 파일 발견: ${summarizeList(offenders)}`,
  };
}

export function evaluateU17(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-17")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-17", status: "skip", evidence: "/etc/init.d가 존재하지 않음 (init 스크립트 미사용)" };
  }

  const offenders = stdout ? stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  return {
    id: "U-17",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "시스템 시작 스크립트 소유자/권한이 안전함"
        : `소유자가 root가 아니거나 그룹/전체 쓰기 권한이 있는 시작 스크립트: ${summarizeList(offenders)}`,
  };
}

export function evaluateU18(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-18")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-18", status: "skip", evidence: "대상 컨테이너에 /etc/shadow가 존재하지 않음" };
  }

  const [ownerGroup, mode] = stdout.split(/\s+/);
  const isRootOwned = ownerGroup === "root:root" || ownerGroup === "root:shadow";
  // Classic KISA guidance is "400 or stricter", but Debian/Ubuntu ship
  // root:shadow 640 by default (group-readable only by the trusted "shadow"
  // group, used by setgid passwd/chsh/etc.) — that's an equally secure,
  // widely-deployed standard, not a misconfiguration. Require: no write for
  // group, and zero access at all for other.
  const isSafeMode = isSafeShadowMode(mode ?? "");
  const fail = !isRootOwned || !isSafeMode;

  return {
    id: "U-18",
    status: fail ? "fail" : "pass",
    evidence: `소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}`,
  };
}

export function evaluateU19(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-19")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-19", status: "skip", evidence: "대상 컨테이너에 /etc/hosts가 존재하지 않음" };
  }

  const [ownerGroup, mode] = stdout.split(/\s+/);
  const isRootOwned = ownerGroup === "root:root";
  const isSafeMode = hasNoGroupOrOtherWrite(mode ?? "");
  const fail = !isRootOwned || !isSafeMode;

  return {
    id: "U-19",
    status: fail ? "fail" : "pass",
    evidence: `소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}`,
  };
}

function parseNamedStatLines(stdout: string): { name: string; ownerGroup: string; mode: string }[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ownerGroup, mode] = line.split(/\s+/);
      return { name, ownerGroup, mode };
    });
}

export function evaluateU20(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-20")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-20", status: "skip", evidence: "(x)inetd.conf가 존재하지 않음 ((x)inetd 미사용)" };
  }

  const entries = parseNamedStatLines(stdout);
  const offenders = entries.filter(
    ({ ownerGroup, mode }) => ownerGroup !== "root:root" || !hasNoGroupOrOtherWrite(mode),
  );

  return {
    id: "U-20",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? `점검 대상 소유자/권한 안전함: ${entries.map((e) => `${e.name} ${e.ownerGroup} ${e.mode}`).join(", ")}`
        : `소유자/권한 미흡: ${offenders.map((e) => `${e.name} ${e.ownerGroup} ${e.mode}`).join(", ")}`,
  };
}

export function evaluateU21(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-21")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-21", status: "skip", evidence: "(r)syslog.conf가 존재하지 않음 (syslog 미사용)" };
  }

  const entries = parseNamedStatLines(stdout);
  const offenders = entries.filter(
    ({ ownerGroup, mode }) => ownerGroup !== "root:root" || !hasNoGroupOrOtherWrite(mode),
  );

  return {
    id: "U-21",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? `점검 대상 소유자/권한 안전함: ${entries.map((e) => `${e.name} ${e.ownerGroup} ${e.mode}`).join(", ")}`
        : `소유자/권한 미흡: ${offenders.map((e) => `${e.name} ${e.ownerGroup} ${e.mode}`).join(", ")}`,
  };
}

export function evaluateU22(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-22")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-22", status: "skip", evidence: "대상 컨테이너에 /etc/services가 존재하지 않음" };
  }

  const [ownerGroup, mode] = stdout.split(/\s+/);
  const isRootOwned = ownerGroup === "root:root";
  const isSafeMode = hasNoGroupOrOtherWrite(mode ?? "");
  const fail = !isRootOwned || !isSafeMode;

  return {
    id: "U-22",
    status: fail ? "fail" : "pass",
    evidence: `소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}`,
  };
}

export function evaluateU23(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-23")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-23", status: "skip", evidence: "world-writable 임시 디렉터리(/tmp, /var/tmp, /dev/shm)가 없음" };
  }

  const offenders = stdout ? stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  return {
    id: "U-23",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "world-writable 디렉터리 내 SUID/SGID/Sticky-bit 파일 없음"
        : `world-writable 디렉터리 내 SUID/SGID/Sticky-bit 파일 발견: ${summarizeList(offenders)}`,
  };
}

export function evaluateU24(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-24")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-24", status: "skip", evidence: "시스템 환경변수 파일(/etc/profile 등)이 존재하지 않음" };
  }

  const entries = parseNamedStatLines(stdout);
  const offenders = entries.filter(
    ({ ownerGroup, mode }) => ownerGroup !== "root:root" || !hasNoGroupOrOtherWrite(mode),
  );

  return {
    id: "U-24",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? `환경변수 파일 소유자/권한 안전함: ${entries.map((e) => `${e.name} ${e.ownerGroup} ${e.mode}`).join(", ")}`
        : `소유자/권한 미흡: ${offenders.map((e) => `${e.name} ${e.ownerGroup} ${e.mode}`).join(", ")}`,
  };
}

export function evaluateU25(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-25")?.stdout.trim() ?? "";
  const offenders = stdout ? stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];

  if (offenders.length === 0) {
    return { id: "U-25", status: "pass", evidence: "world-writable 파일이 발견되지 않음" };
  }
  return { id: "U-25", status: "fail", evidence: `world-writable 파일 발견: ${summarizeList(offenders)}` };
}

// Device nodes Docker itself always bind-mounts into every container. On
// some Docker host setups (e.g. Docker Desktop's virtualized Linux VM),
// `find -type f` misreports these as regular files even though `stat`
// correctly reports them as character devices — a stat/statx quirk of the
// bind mount, not a real "irregular file" finding. Same allowlist idea as
// EXPECTED_SETUID_BINARIES for C-06.
const EXPECTED_DEV_ENTRIES = new Set([
  "/dev/console",
  "/dev/tty",
  "/dev/ptmx",
  "/dev/null",
  "/dev/zero",
  "/dev/full",
  "/dev/random",
  "/dev/urandom",
]);

export function evaluateU26(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-26")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-26", status: "skip", evidence: "대상 컨테이너에 /dev 디렉터리가 존재하지 않음" };
  }

  const offenders = (stdout ? stdout.split("\n").map((line) => line.trim()).filter(Boolean) : []).filter(
    (path) => !EXPECTED_DEV_ENTRIES.has(path),
  );
  return {
    id: "U-26",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "/dev 내 비정상적인(일반 파일 형태) 장치 파일이 없음"
        : `/dev 내 정상적이지 않은 파일 발견: ${summarizeList(offenders)}`,
  };
}

export function evaluateU27(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-27")?.stdout.trim() ?? "";
  const [, equivSection = "", afterEquiv = stdout] = stdout.split(/__EQUIV_START__|__EQUIV_END__/);
  const hasEquivRule = equivSection.split("\n").some(isActiveLine);
  const rhostsFiles = afterEquiv
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "__EQUIV_START__" && line !== "__EQUIV_END__");

  const fail = hasEquivRule || rhostsFiles.length > 0;

  return {
    id: "U-27",
    status: fail ? "fail" : "pass",
    evidence: fail
      ? `신뢰 관계 설정 발견: ${hasEquivRule ? "/etc/hosts.equiv에 활성 항목 있음" : ""}${
          hasEquivRule && rhostsFiles.length > 0 ? " / " : ""
        }${rhostsFiles.length > 0 ? `.rhosts 파일: ${summarizeList(rhostsFiles)}` : ""}`
      : "/etc/hosts.equiv 미사용 및 $HOME/.rhosts 파일 없음",
  };
}

export function evaluateU28(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-28")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return {
      id: "U-28",
      status: "skip",
      evidence: "접속 제어 메커니즘(hosts.allow/deny, iptables)이 확인되지 않음",
    };
  }

  const allowMatch = stdout.match(/__ALLOW_START__([\s\S]*?)__ALLOW_END__/);
  const denyMatch = stdout.match(/__DENY_START__([\s\S]*?)__DENY_END__/);
  const iptablesMatch = stdout.match(/__IPTABLES_START__([\s\S]*?)__IPTABLES_END__/);

  const hasAllowDenyRule =
    (allowMatch?.[1].split("\n").some(isActiveLine) ?? false) ||
    (denyMatch?.[1].split("\n").some(isActiveLine) ?? false);

  const iptablesRuleLines = (iptablesMatch?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(ACCEPT|DROP|REJECT|LOG)\b/.test(line));

  const fail = !hasAllowDenyRule && iptablesRuleLines.length === 0;

  return {
    id: "U-28",
    status: fail ? "fail" : "pass",
    evidence: fail
      ? "hosts.allow/deny와 iptables 어디에도 접속 IP/포트 제한 규칙이 없음"
      : `접속 제한 규칙 발견 (${hasAllowDenyRule ? "hosts.allow/deny" : ""}${
          hasAllowDenyRule && iptablesRuleLines.length > 0 ? ", " : ""
        }${iptablesRuleLines.length > 0 ? "iptables" : ""})`,
  };
}

export function evaluateU29(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-29")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-29", status: "skip", evidence: "/etc/hosts.lpd가 존재하지 않음 (LPD 미사용)" };
  }

  const [ownerGroup, mode] = stdout.split(/\s+/);
  const isRootOwned = ownerGroup === "root:root";
  const isSafeMode = hasNoGroupOrOtherWrite(mode ?? "");
  const fail = !isRootOwned || !isSafeMode;

  return {
    id: "U-29",
    status: fail ? "fail" : "pass",
    evidence: `소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}`,
  };
}

export function evaluateU30(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-30")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-30", status: "skip", evidence: "UMASK을 설정할 시스템 파일이 존재하지 않음" };
  }

  const activeLines = stdout.split("\n").filter(isActiveLine).filter((line) => /umask/i.test(line));
  if (activeLines.length === 0) {
    return { id: "U-30", status: "fail", evidence: "UMASK 설정이 없어 기본값을 신뢰할 수 없음" };
  }

  const lastValue = activeLines[activeLines.length - 1].trim().split(/\s+/).pop() ?? "";
  const mask = /^[0-7]{3,4}$/.test(lastValue) ? parseInt(lastValue, 8) : NaN;
  // Secure UMASK must remove write permission for both group and other
  // (i.e. include at least the 022 bits) for newly created files.
  const fail = Number.isNaN(mask) || (mask & 0o022) !== 0o022;

  return {
    id: "U-30",
    status: fail ? "fail" : "pass",
    evidence: `UMASK=${lastValue || "확인 불가"}`,
  };
}

export function evaluateU31(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-31")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-31", status: "skip", evidence: "/etc/passwd가 존재하지 않음" };
  }

  // Only interactive (login-capable) accounts' home directories matter here
  // — system/service accounts commonly have loosely-owned or shared homes
  // (e.g. /nonexistent, /) that aren't a real misconfiguration.
  const offenders: string[] = [];
  for (const line of stdout.split("\n")) {
    // Each line is "name:shell:owner mode" (see U-31 task in security-checks.yml).
    const match = line.trim().match(/^([^:]*):([^:]*):(\S+) (\S+)$/);
    if (!match) continue;
    const [, accountName, accountShell, owner, homeMode] = match;
    if (NOLOGIN_SHELLS.has(accountShell)) continue;
    if (owner !== accountName || !hasNoGroupOrOtherWrite(homeMode)) {
      offenders.push(`${accountName}(소유자:${owner}, 권한:${homeMode})`);
    }
  }

  return {
    id: "U-31",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "로그인 가능 계정의 홈 디렉터리 소유자/권한이 안전함"
        : `홈 디렉터리 소유자/권한 미흡: ${offenders.join(", ")}`,
  };
}

export function evaluateU32(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-32")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-32", status: "skip", evidence: "/etc/passwd가 존재하지 않음" };
  }

  const offenders = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, , home, shell] = line.split(":");
      return { name, home, shell: shell ?? "" };
    })
    .filter(({ shell }) => !NOLOGIN_SHELLS.has(shell));

  return {
    id: "U-32",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "모든 로그인 계정의 홈 디렉터리가 실제로 존재함"
        : `홈 디렉터리가 존재하지 않는 계정: ${offenders.map((o) => `${o.name}(${o.home})`).join(", ")}`,
  };
}

// Legitimate dotfiles/dirs commonly created by base images and interactive
// shells — everything else under a hidden name in these paths is treated as
// suspicious (a well-known technique for hiding payloads is naming a file
// "...", ".. " or similar so it's invisible to a casual `ls`).
const EXPECTED_HIDDEN_ENTRIES = new Set([
  ".bashrc",
  ".bash_profile",
  ".bash_logout",
  ".bash_history",
  ".profile",
  ".cache",
  ".config",
  ".local",
  ".ssh",
  ".gnupg",
  ".vim",
  ".viminfo",
  ".wget-hsts",
  ".npm",
  ".docker",
  ".lesshst",
  ".ansible",
]);

export function evaluateU33(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-33")?.stdout.trim() ?? "";
  const entries = stdout ? stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  const suspicious = entries.filter((entryPath) => {
    const base = entryPath.split("/").pop() ?? "";
    return !EXPECTED_HIDDEN_ENTRIES.has(base);
  });

  if (suspicious.length === 0) {
    return { id: "U-33", status: "pass", evidence: "표준적이지 않은 숨겨진 파일/디렉터리가 발견되지 않음" };
  }
  return {
    id: "U-33",
    status: "fail",
    evidence: `점검이 필요한 숨겨진 파일/디렉터리 발견: ${summarizeList(suspicious)}`,
  };
}
// U-34..U-67 (KISA guide, service/patch/log management, #46): completes the
// Unix catalog. Most of U-34..U-61 ask "is this legacy/unnecessary service
// even installed" -- KISA guidance for those is "must not be present or
// reachable", so on a minimal container image (the common case here) the
// correct outcome is overwhelmingly "skip", never a false "fail". A handful
// of items (U-37, U-62, U-63, U-64, U-65, U-66, U-67) are evaluable on
// virtually any container and rarely skip. See individual comments below for
// judgment calls -- U-64 (patch management) especially, which can't be
// reliably pass/failed from a static image snapshot at all.

// getServiceVariant/getServiceConfig mirror getNginxState (W-section, #47):
// several of the U-45..U-61 items share a service-family detection/config
// helper task (mail/dns/ftp/snmp) instead of each re-implementing "is this
// service even present" from scratch. Reuses findExactTaskOutput, which is
// defined further down in this file alongside the nginx W-checks --
// function declarations hoist, so this is safe.
function getServiceVariant(tasks: AnsibleTaskOutput[], detectionTaskName: string): string {
  return findExactTaskOutput(tasks, detectionTaskName)?.stdout.trim() || "absent";
}

function getServiceConfig(tasks: AnsibleTaskOutput[], configTaskName: string): string {
  const raw = findExactTaskOutput(tasks, configTaskName)?.stdout ?? "";
  return raw.trim() === MISSING_MARKER ? "" : raw;
}

// Shared by the many U-34..U-52 "does this legacy/unnecessary service exist
// on the container at all" checks (U-34/36/39/41/42/43/44/52): KISA guidance
// for every one of these is "there must be no active or reachable instance",
// not "reconfigure it" -- so there's no secondary configuration to inspect,
// and any evidence line at all (a matching binary or an inetd/xinetd entry)
// is itself the finding. On a minimal container image the overwhelmingly
// common outcome is empty output, i.e. skip -- never a false "fail". This is
// the shared shape #46 factors out, mirroring how #44 factored out
// hasNoGroupOrOtherWrite/summarizeList.
function evaluateServiceAbsence(id: string, tasks: AnsibleTaskOutput[], serviceLabel: string): CheckResult {
  const stdout = findTaskOutput(tasks, id)?.stdout.trim() ?? "";
  const lines = stdout ? stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  if (lines.length === 0) {
    return { id, status: "skip", evidence: `${serviceLabel}가 설치/구성되어 있지 않음` };
  }
  return {
    id,
    status: "fail",
    evidence: `${serviceLabel} 관련 흔적 발견 (비활성화 필요): ${summarizeList(lines)}`,
  };
}

export function evaluateU34(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-34", tasks, "finger 서비스");
}

export function evaluateU35(tasks: AnsibleTaskOutput[]): CheckResult {
  // "공유 서비스" covers the classic KISA anonymous-access surfaces: Samba
  // guest access and NFS's no_root_squash/insecure export options.
  // Empty (not missing) output is meaningful here: it means the ansible task
  // found a Samba/NFS config file (found=1) but no anonymous-access lines
  // matched -- that's "present and safe" (pass), not "absent" (skip). Only
  // the explicit MISSING_MARKER means neither service is configured at all.
  const stdout = findTaskOutput(tasks, "U-35")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-35", status: "skip", evidence: "공유 서비스(Samba/NFS)가 감지되지 않음" };
  }
  const offenders = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(SMB|NFS):/.test(line));
  return {
    id: "U-35",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "공유 서비스 설정에서 익명/게스트 접근 허용 항목이 발견되지 않음"
        : `공유 서비스에 익명 접근을 허용하는 설정 발견: ${summarizeList(offenders)}`,
  };
}

export function evaluateU36(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-36", tasks, "r계열 서비스(rsh/rlogin/rexec)");
}

// The trusted "crontab" group (see evaluateU37 below) is allowed group-write
// -- only "other" having zero access matters for it.
function isSafeCrontabGroupMode(mode: string): boolean {
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  return Number(mode.slice(-1)) === 0;
}

export function evaluateU37(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-37")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-37", status: "skip", evidence: "crontab 관련 설정 파일/디렉터리가 존재하지 않음" };
  }
  const entries = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "FILE <path> <owner:group> <mode>"
      const [, filePath, ownerGroup, mode] = line.split(/\s+/);
      return { filePath, ownerGroup, mode };
    });
  // Debian/Ubuntu ship /var/spool/cron/crontabs as root:crontab 1730 by
  // default -- group-write is intentional there (only the setgid `crontab`
  // binary belongs to that group, same trusted-group idea as root:shadow for
  // U-18) and isn't a misconfiguration. Everywhere else, neither group nor
  // other should have write access.
  const offenders = entries.filter(({ ownerGroup, mode }) => {
    if (ownerGroup === "root:crontab") return !isSafeCrontabGroupMode(mode ?? "");
    return ownerGroup !== "root:root" || !hasNoGroupOrOtherWrite(mode ?? "");
  });
  return {
    id: "U-37",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? `crontab 설정 파일 소유자/권한 안전함: ${entries.map((e) => `${e.filePath} ${e.ownerGroup} ${e.mode}`).join(", ")}`
        : `crontab 설정 파일 소유자/권한 미흡: ${offenders.map((e) => `${e.filePath} ${e.ownerGroup} ${e.mode}`).join(", ")}`,
  };
}

export function evaluateU38(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-38")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return {
      id: "U-38",
      status: "skip",
      evidence: "(x)inetd 기반 echo/discard/daytime/chargen 서비스가 감지되지 않음",
    };
  }
  const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const active = lines.filter((line) => line.startsWith("ACTIVE:"));
  return {
    id: "U-38",
    status: active.length === 0 ? "pass" : "fail",
    evidence:
      active.length === 0
        ? `서비스 항목은 존재하나 모두 비활성화됨: ${summarizeList(lines)}`
        : `DoS 공격에 취약한 서비스가 활성화되어 있음: ${summarizeList(active)}`,
  };
}

export function evaluateU39(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-39", tasks, "NFS 서비스");
}

export function evaluateU40(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-40")?.stdout.trim() ?? "";
  if (stdout === MISSING_MARKER) {
    return { id: "U-40", status: "skip", evidence: "/etc/exports가 존재하지 않음 (NFS 서버 미사용)" };
  }
  const activeLines = stdout.split("\n").filter(isActiveLine);
  if (activeLines.length === 0) {
    return { id: "U-40", status: "pass", evidence: "/etc/exports에 등록된 공유 항목이 없음" };
  }
  const offenders = activeLines.filter((line) => {
    const rest = line.trim().split(/\s+/).slice(1).join(" ");
    return rest === "" || /(^|\s)\*(\(|\s|$)/.test(rest);
  });
  return {
    id: "U-40",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "모든 NFS 공유 항목에 클라이언트 접근 제한이 설정됨"
        : `클라이언트 제한 없이 공유된 NFS 항목 발견 (와일드카드 또는 클라이언트 지정 누락): ${summarizeList(offenders)}`,
  };
}

export function evaluateU41(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-41", tasks, "automountd");
}

export function evaluateU42(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-42", tasks, "RPC 서비스");
}

export function evaluateU43(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-43", tasks, "NIS/NIS+ 서비스");
}

export function evaluateU44(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-44", tasks, "tftp/talk 서비스");
}

// U-45 (mail version) and U-49 (DNS version) can't be turned into a
// meaningful pass/fail from inside a static container: we have no CVE
// database to compare the extracted version string against. Rather than
// guess, both surface "review" with the detected version as evidence, same
// reasoning as U-64 below.
export function evaluateU45(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "mail service detection (internal)");
  if (variant === "absent") {
    return { id: "U-45", status: "skip", evidence: "메일 서비스(sendmail/postfix/exim)가 감지되지 않음" };
  }
  const versionInfo = findTaskOutput(tasks, "U-45")?.stdout.trim() || "확인 불가";
  return {
    id: "U-45",
    status: "review",
    evidence: `메일 서비스(${variant}) 버전 정보: ${versionInfo} — 정적 이미지 점검만으로는 최신 보안 패치 적용 여부를 판단할 수 없어 벤더 보안 권고사항과 수동 대조가 필요함`,
  };
}

export function evaluateU46(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "mail service detection (internal)");
  if (variant === "absent") {
    return { id: "U-46", status: "skip", evidence: "메일 서비스가 감지되지 않음" };
  }
  if (variant === "postfix") {
    return {
      id: "U-46",
      status: "pass",
      evidence: "Postfix는 기본 설정상 메일 큐 조작을 권한이 있는 계정으로 제한함",
    };
  }
  const stdout = findTaskOutput(tasks, "U-46")?.stdout.trim() ?? "";
  const restricted = stdout.split("\n").filter(isActiveLine).some((line) => /restrictqrun/i.test(line));
  return {
    id: "U-46",
    status: restricted ? "pass" : "fail",
    evidence: restricted
      ? "sendmail.cf PrivacyOptions에 restrictqrun 설정됨"
      : `${variant} 메일 서비스에서 일반 사용자의 메일 큐 접근을 제한하는 설정이 확인되지 않음`,
  };
}

export function evaluateU47(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "mail service detection (internal)");
  if (variant === "absent") {
    return { id: "U-47", status: "skip", evidence: "메일 서비스가 감지되지 않음" };
  }
  const stdout = findTaskOutput(tasks, "U-47")?.stdout.trim() ?? "";
  const activeLines = stdout.split("\n").filter(isActiveLine);
  if (variant === "postfix") {
    const openRelay = activeLines.some((line) => /^mynetworks\s*=.*0\.0\.0\.0\/0/.test(line));
    return {
      id: "U-47",
      status: openRelay ? "fail" : "pass",
      evidence: openRelay
        ? "Postfix mynetworks가 모든 네트워크(0.0.0.0/0)로부터의 릴레이를 허용함"
        : "Postfix mynetworks가 개방형 릴레이(0.0.0.0/0)로 설정되어 있지 않음",
    };
  }
  const hasAccessControl = activeLines.length > 0;
  return {
    id: "U-47",
    status: hasAccessControl ? "pass" : "fail",
    evidence: hasAccessControl
      ? "메일 릴레이 접근 제어 설정(/etc/mail/access)이 존재함"
      : "메일 릴레이를 제한하는 접근 제어 설정이 확인되지 않음",
  };
}

export function evaluateU48(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "mail service detection (internal)");
  if (variant === "absent") {
    return { id: "U-48", status: "skip", evidence: "메일 서비스가 감지되지 않음" };
  }
  const stdout = findTaskOutput(tasks, "U-48")?.stdout.trim() ?? "";
  const activeLines = stdout.split("\n").filter(isActiveLine);
  if (variant === "postfix") {
    const disabled = activeLines.some((line) => /^disable_vrfy_command\s*=\s*yes/i.test(line));
    return {
      id: "U-48",
      status: disabled ? "pass" : "fail",
      evidence: disabled
        ? "Postfix disable_vrfy_command=yes 설정됨"
        : "Postfix에서 VRFY 명령어가 비활성화되어 있지 않음 (기본값은 활성화)",
    };
  }
  const restricted =
    activeLines.some((line) => /noexpn/i.test(line)) && activeLines.some((line) => /novrfy/i.test(line));
  return {
    id: "U-48",
    status: restricted ? "pass" : "fail",
    evidence: restricted
      ? "sendmail.cf PrivacyOptions에 noexpn/novrfy 설정됨"
      : `${variant} 메일 서비스에서 EXPN/VRFY 명령어 제한 설정이 확인되지 않음`,
  };
}

export function evaluateU49(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = getServiceVariant(tasks, "dns service detection (internal)") === "present";
  if (!present) {
    return { id: "U-49", status: "skip", evidence: "DNS 서비스(BIND)가 감지되지 않음" };
  }
  const versionInfo = findTaskOutput(tasks, "U-49")?.stdout.trim() || "확인 불가";
  return {
    id: "U-49",
    status: "review",
    evidence: `DNS 서비스(BIND) 버전 정보: ${versionInfo} — 정적 이미지 점검만으로는 최신 보안 패치 적용 여부를 판단할 수 없어 벤더 보안 권고사항과 수동 대조가 필요함`,
  };
}

export function evaluateU50(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = getServiceVariant(tasks, "dns service detection (internal)") === "present";
  if (!present) {
    return { id: "U-50", status: "skip", evidence: "DNS 서비스(BIND)가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "dns effective config (internal)");
  const activeLines = config.split("\n").filter(isActiveLine);
  const transferLine = activeLines.find((line) => /allow-transfer/.test(line));
  if (!transferLine) {
    return {
      id: "U-50",
      status: "fail",
      evidence: "allow-transfer 설정이 없어 Zone Transfer 제한 여부를 확인할 수 없음 (미설정 시 위험 가능성)",
    };
  }
  const isAny = /allow-transfer\s*\{\s*any\s*;/.test(transferLine);
  return {
    id: "U-50",
    status: isAny ? "fail" : "pass",
    evidence: `allow-transfer 설정: ${transferLine.trim()}`,
  };
}

export function evaluateU51(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = getServiceVariant(tasks, "dns service detection (internal)") === "present";
  if (!present) {
    return { id: "U-51", status: "skip", evidence: "DNS 서비스(BIND)가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "dns effective config (internal)");
  const activeLines = config.split("\n").filter(isActiveLine);
  const updateLine = activeLines.find((line) => /allow-update/.test(line));
  if (!updateLine) {
    return { id: "U-51", status: "pass", evidence: "allow-update 설정이 없어 동적 업데이트가 비활성화됨 (기본값)" };
  }
  const isAny = /allow-update\s*\{\s*any\s*;/.test(updateLine);
  return {
    id: "U-51",
    status: isAny ? "fail" : "pass",
    evidence: `allow-update 설정: ${updateLine.trim()}`,
  };
}

export function evaluateU52(tasks: AnsibleTaskOutput[]): CheckResult {
  return evaluateServiceAbsence("U-52", tasks, "telnet 서비스");
}

export function evaluateU53(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "ftp service detection (internal)");
  if (variant === "absent") {
    return { id: "U-53", status: "skip", evidence: "FTP 서비스가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "ftp effective config (internal)");
  if (!config) {
    return {
      id: "U-53",
      status: "fail",
      evidence: `${variant} 설정 파일을 확인할 수 없어 배너 커스터마이징 여부를 확인할 수 없음`,
    };
  }
  const activeLines = config.split("\n").filter(isActiveLine);
  const customBanner =
    activeLines.some((line) => /^ftpd_banner\s*=/.test(line)) || // vsftpd
    activeLines.some((line) => /^ServerIdent\s+on/i.test(line)); // proftpd
  return {
    id: "U-53",
    status: customBanner ? "pass" : "fail",
    evidence: customBanner
      ? "FTP 배너가 커스터마이징되어 버전 정보가 노출되지 않음"
      : `${variant} 기본 배너를 사용 중이어서 버전 정보가 노출될 수 있음`,
  };
}

export function evaluateU54(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "ftp service detection (internal)");
  if (variant === "absent") {
    return { id: "U-54", status: "skip", evidence: "FTP 서비스가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "ftp effective config (internal)");
  if (!config) {
    return {
      id: "U-54",
      status: "fail",
      evidence: `${variant} 설정 파일을 확인할 수 없어 암호화(TLS) 적용 여부를 확인할 수 없음`,
    };
  }
  const activeLines = config.split("\n").filter(isActiveLine);
  const tlsEnabled =
    activeLines.some((line) => /^ssl_enable\s*=\s*YES/i.test(line)) || // vsftpd
    activeLines.some((line) => /^TLSEngine\s+on/i.test(line)); // proftpd mod_tls
  return {
    id: "U-54",
    status: tlsEnabled ? "pass" : "fail",
    evidence: tlsEnabled
      ? "FTP 서비스에 TLS/SSL이 활성화됨"
      : `${variant}에서 TLS/SSL이 활성화되어 있지 않아 인증정보가 평문으로 전송됨`,
  };
}

export function evaluateU55(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "ftp service detection (internal)");
  if (variant === "absent") {
    return { id: "U-55", status: "skip", evidence: "FTP 서비스가 감지되지 않음" };
  }
  const stdout = findTaskOutput(tasks, "U-55")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-55", status: "pass", evidence: "ftp 시스템 계정이 /etc/passwd에 존재하지 않음" };
  }
  // /etc/passwd: name:pass:uid:gid:gecos:home:shell
  const shell = stdout.split(":")[6];
  const fail = shell !== undefined && !NOLOGIN_SHELLS.has(shell.trim());
  return {
    id: "U-55",
    status: fail ? "fail" : "pass",
    evidence: `ftp 계정 Shell: ${shell || "확인 불가"}`,
  };
}

export function evaluateU56(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "ftp service detection (internal)");
  if (variant === "absent") {
    return { id: "U-56", status: "skip", evidence: "FTP 서비스가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "ftp effective config (internal)");
  if (!config) {
    return {
      id: "U-56",
      status: "fail",
      evidence: `${variant} 설정 파일을 확인할 수 없어 접근 제어 설정 여부를 확인할 수 없음`,
    };
  }
  const activeLines = config.split("\n").filter(isActiveLine);
  const hasAccessControl =
    activeLines.some((line) => /^tcp_wrappers\s*=\s*YES/i.test(line)) ||
    (activeLines.some((line) => /^userlist_enable\s*=\s*YES/i.test(line)) &&
      activeLines.some((line) => /^userlist_deny\s*=\s*NO/i.test(line))) ||
    activeLines.some((line) => /<Limit LOGIN>/i.test(line));
  return {
    id: "U-56",
    status: hasAccessControl ? "pass" : "fail",
    evidence: hasAccessControl
      ? "FTP 접근 제어 설정(tcp_wrappers/userlist/Limit LOGIN)이 발견됨"
      : `${variant}에 접근 제어(tcp_wrappers, userlist 등) 설정이 발견되지 않음`,
  };
}

export function evaluateU57(tasks: AnsibleTaskOutput[]): CheckResult {
  const variant = getServiceVariant(tasks, "ftp service detection (internal)");
  if (variant === "absent") {
    return { id: "U-57", status: "skip", evidence: "FTP 서비스가 감지되지 않음" };
  }
  const stdout = findTaskOutput(tasks, "U-57")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-57", status: "fail", evidence: "ftpusers 파일이 존재하지 않아 특정 계정의 FTP 접근을 제한할 수 없음" };
  }
  const hasRootDenied = stdout.split("\n").some((line) => /^root\s*$/.test(line.trim()));
  return {
    id: "U-57",
    status: hasRootDenied ? "pass" : "fail",
    evidence: hasRootDenied
      ? "ftpusers에 root 계정이 등록되어 FTP 접근이 차단됨"
      : "ftpusers 파일에 root 계정이 등록되어 있지 않음",
  };
}

export function evaluateU58(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = getServiceVariant(tasks, "snmp service detection (internal)") === "present";
  if (!present) {
    return { id: "U-58", status: "skip", evidence: "SNMP 서비스가 감지되지 않음" };
  }
  return {
    id: "U-58",
    status: "fail",
    evidence: "SNMP 서비스(snmpd)가 구동 중이며, 불필요할 경우 비활성화가 필요함",
  };
}

export function evaluateU59(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = getServiceVariant(tasks, "snmp service detection (internal)") === "present";
  if (!present) {
    return { id: "U-59", status: "skip", evidence: "SNMP 서비스가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "snmp effective config (internal)");
  if (!config) {
    return { id: "U-59", status: "fail", evidence: "snmpd.conf를 확인할 수 없어 SNMP 버전을 확인할 수 없음" };
  }
  const activeLines = config.split("\n").filter(isActiveLine);
  const hasLegacyVersion = activeLines.some((line) => /^(rocommunity|rwcommunity|com2sec)\b/.test(line));
  const hasV3User = activeLines.some((line) => /^(createUser|rouser|rwuser)\b/.test(line));
  const fail = hasLegacyVersion || !hasV3User;
  return {
    id: "U-59",
    status: fail ? "fail" : "pass",
    evidence: fail
      ? "SNMP v1/v2c(커뮤니티 스트링 기반) 설정이 발견되었거나 v3 사용자 인증 설정이 없음"
      : "SNMP v3(사용자 인증 기반) 설정만 발견됨",
  };
}

export function evaluateU60(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = getServiceVariant(tasks, "snmp service detection (internal)") === "present";
  if (!present) {
    return { id: "U-60", status: "skip", evidence: "SNMP 서비스가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "snmp effective config (internal)");
  const activeLines = config.split("\n").filter(isActiveLine);
  const communityLines = activeLines.filter((line) => /^(rocommunity|rwcommunity)\b/.test(line));
  if (communityLines.length === 0) {
    return { id: "U-60", status: "pass", evidence: "커뮤니티 스트링 기반(v1/v2c) 설정이 없음" };
  }
  const weak = communityLines.filter((line) => /\b(public|private)\b/i.test(line));
  return {
    id: "U-60",
    status: weak.length === 0 ? "pass" : "fail",
    evidence:
      weak.length === 0
        ? "SNMP community string이 기본값(public/private)을 사용하지 않음"
        : `SNMP community string이 기본값을 사용 중: ${summarizeList(weak)}`,
  };
}

export function evaluateU61(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = getServiceVariant(tasks, "snmp service detection (internal)") === "present";
  if (!present) {
    return { id: "U-61", status: "skip", evidence: "SNMP 서비스가 감지되지 않음" };
  }
  const config = getServiceConfig(tasks, "snmp effective config (internal)");
  if (!config) {
    return { id: "U-61", status: "fail", evidence: "snmpd.conf를 확인할 수 없어 접근 제어 설정 여부를 확인할 수 없음" };
  }
  const activeLines = config.split("\n").filter(isActiveLine);
  const relevantLines = activeLines.filter((line) => /^(com2sec|rocommunity|rwcommunity)\b/.test(line));
  if (relevantLines.length === 0) {
    return { id: "U-61", status: "fail", evidence: "SNMP 접근을 제한하는 com2sec/community 소스 설정이 발견되지 않음" };
  }
  // com2sec <secName> <source> <community> | rocommunity/rwcommunity <community> [source]
  // -- the source field lands at index 2 for both forms.
  const unrestricted = relevantLines.filter((line) => {
    const source = line.trim().split(/\s+/)[2];
    return !source || source === "default" || source === "0.0.0.0/0" || source === "any";
  });
  return {
    id: "U-61",
    status: unrestricted.length === 0 ? "pass" : "fail",
    evidence:
      unrestricted.length === 0
        ? "SNMP 접근이 특정 소스로 제한됨"
        : `SNMP 접근 제어가 특정 소스로 제한되지 않음: ${summarizeList(unrestricted)}`,
  };
}

export function evaluateU62(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-62")?.stdout ?? "";
  const [, issueNetSection = "", issueSection = ""] = stdout.split(/__ISSUE_NET__|__ISSUE__/);
  const issueNet = issueNetSection.trim();
  const issue = issueSection.trim();
  const hasBanner = issueNet.length > 0 || issue.length > 0;
  return {
    id: "U-62",
    status: hasBanner ? "pass" : "fail",
    evidence: hasBanner
      ? `로그인 경고 배너 설정됨 (issue.net: ${issueNet ? "있음" : "없음"}, issue: ${issue ? "있음" : "없음"})`
      : "/etc/issue.net과 /etc/issue가 모두 비어 있어 로그인 경고 배너가 설정되어 있지 않음",
  };
}

// Standard-safe defaults: root and the conventional admin groups get full
// sudo access by design on most distros -- that's not an "excessive grant".
const SAFE_SUDO_IDENTITIES = new Set(["root", "%sudo", "%wheel", "%admin"]);

export function evaluateU63(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-63")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-63", status: "skip", evidence: "/etc/sudoers가 존재하지 않음 (sudo 미사용)" };
  }

  const offenders: string[] = [];
  for (const line of stdout.split("\n").filter(isActiveLine)) {
    const match = line.trim().match(/^(\S+)\s+ALL\s*=\s*(?:\([^)]*\)\s*)?(NOPASSWD:\s*)?ALL/i);
    if (!match) continue;
    const [, identity, nopasswd] = match;
    if (SAFE_SUDO_IDENTITIES.has(identity)) continue;
    offenders.push(`${identity}${nopasswd ? " (NOPASSWD)" : ""}`);
  }

  return {
    id: "U-63",
    status: offenders.length === 0 ? "pass" : "fail",
    evidence:
      offenders.length === 0
        ? "root/기본 관리자 그룹 외에 전체 권한(ALL=(ALL) ALL) sudo 권한을 가진 계정이 없음"
        : `과도한 sudo 권한(전체 명령 허용)을 가진 계정 발견: ${offenders.join(", ")}`,
  };
}

// U-64 (periodic patch application) can't be reliably turned into a
// pass/fail from a single static container snapshot: there's no "last
// patched" timestamp reliably queryable from inside the image, and we have
// no CVE/vendor-advisory database to compare installed package versions
// against. Guessing pass or fail here would be actively misleading either
// way, so this always returns "review" -- surfacing which package manager
// was detected as context -- and expects a human to cross-check package
// versions against current vendor security advisories. This is the fuzziest
// judgment call in this slice (#46).
export function evaluateU64(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-64")?.stdout.trim() ?? "";
  return {
    id: "U-64",
    status: "review",
    evidence: `패키지 관리자: ${stdout || "확인 불가"} — 정적 이미지 점검만으로는 최신 보안 패치 적용 여부를 판단할 수 없어, 벤더 보안 권고사항과의 수동 대조가 필요함`,
  };
}

export function evaluateU65(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-65")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return {
      id: "U-65",
      status: "skip",
      evidence: "NTP/시각 동기화 서비스가 감지되지 않음 (컨테이너는 통상 호스트 시각을 사용)",
    };
  }
  const activeLines = stdout.split("\n").filter(isActiveLine);
  const hasTimeSource = activeLines.some(
    (line) => /^(server|pool)\s+\S/.test(line) || /^NTP\s*=\s*\S/.test(line),
  );
  return {
    id: "U-65",
    status: hasTimeSource ? "pass" : "fail",
    evidence: hasTimeSource
      ? "시각 동기화 서버(NTP) 설정이 구성되어 있음"
      : "시각 동기화 서비스는 존재하나 동기화 대상 서버가 설정되어 있지 않음",
  };
}

export function evaluateU66(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-66")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-66", status: "skip", evidence: "(r)syslog 설정 파일이 존재하지 않음 (syslog 미사용)" };
  }
  const activeLines = stdout.split("\n").filter(isActiveLine);
  // A syslog/rsyslog selector line looks like "<facility>.<priority> <action>",
  // e.g. "auth,authpriv.* /var/log/auth.log" or "*.info /var/log/messages".
  const hasLoggingRule = activeLines.some((line) => /^\S+\.\S+\s+\S+/.test(line));
  return {
    id: "U-66",
    status: hasLoggingRule ? "pass" : "fail",
    evidence: hasLoggingRule
      ? "syslog/rsyslog에 활성화된 로깅 규칙이 설정되어 있음"
      : "syslog 설정 파일은 존재하나 활성화된 로깅 규칙(facility.priority)이 없음",
  };
}

export function evaluateU67(tasks: AnsibleTaskOutput[]): CheckResult {
  const stdout = findTaskOutput(tasks, "U-67")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "U-67", status: "skip", evidence: "대상 컨테이너에 /var/log 디렉터리가 존재하지 않음" };
  }
  const [ownerGroup, mode] = stdout.split(/\s+/);
  const isRootOwned = ownerGroup === "root:root";
  const isSafeMode = hasNoGroupOrOtherWrite(mode ?? "");
  const fail = !isRootOwned || !isSafeMode;
  return {
    id: "U-67",
    status: fail ? "fail" : "pass",
    evidence: `/var/log 소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}`,
  };
}

// WEB-01..WEB-26 (KISA 주요정보통신기반시설 기술적 취약점 분석·평가 상세
// 가이드, 웹 서비스 — see "web 점검 컴플라이언스.MD" for the full source
// text this section implements): nginx-only for MVP scope. Unlike the old
// Apache/IIS-split catalog this replaces, the current guide has no
// server-specific split at all -- every item is phrased generically, so
// there's no "always skip, wrong platform" bucket the way IIS items used to
// be. "nginx detection (internal)", "nginx effective config (internal)" and
// "nginx version (internal)" are helper tasks in security-checks.yml with no
// catalog id of their own, so they're matched by exact task name rather than
// the `<id>:` prefix `findTaskOutput` relies on elsewhere in this file.
function findExactTaskOutput(
  tasks: AnsibleTaskOutput[],
  taskName: string,
): AnsibleTaskOutput | undefined {
  return tasks.find((task) => task.taskName === taskName);
}

// Shared by every real WEB check: whether nginx is present, and (if so) its
// fully-resolved `nginx -T` config text. When nginx isn't present, every
// real WEB item evaluates to "skip" rather than pass/fail.
function getNginxState(tasks: AnsibleTaskOutput[]): { present: boolean; config: string } {
  const present = findExactTaskOutput(tasks, "nginx detection (internal)")?.stdout.trim() === "present";
  const rawConfig = findExactTaskOutput(tasks, "nginx effective config (internal)")?.stdout ?? "";
  return { present, config: rawConfig.trim() === MISSING_MARKER ? "" : rawConfig };
}

function skipNoNginx(id: string): CheckResult {
  return { id, status: "skip", evidence: "웹서버(nginx)가 감지되지 않음" };
}

// "600 이하" (WEB-03's pass bar): owner may have any access, but neither
// group nor other may have any access at all -- stricter than the
// group-write-only checks used elsewhere (hasNoGroupOrOtherWrite), since a
// credentials file being merely group-readable already fails this guide.
function isAtMostOwnerOnly(mode: string): boolean {
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [group, other] = mode.slice(-3).split("").map(Number).slice(1);
  return group === 0 && other === 0;
}

// WEB-01/WEB-02: nginx has no built-in admin account system, only opaque
// HTTP basic auth (auth_basic + a hashed htpasswd file). The account name
// and password strength both live inside that hashed file, invisible to
// config-only inspection -- so the honest automated outcome is "review" once
// auth_basic is in use, not a guessed pass/fail, and "skip" when there's no
// authentication surface (and therefore no "admin account") at all.
function hasActiveBasicAuth(config: string): boolean {
  return config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /^auth_basic\s+/.test(line.trim()) && !/^auth_basic\s+off\s*;/.test(line.trim()));
}

export function evaluateWEB01(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-01");

  if (!hasActiveBasicAuth(config)) {
    return { id: "WEB-01", status: "skip", evidence: "nginx에 관리자 인증(auth_basic) 구간이 설정되어 있지 않음" };
  }
  return {
    id: "WEB-01",
    status: "review",
    evidence: "auth_basic 인증이 설정되어 있으나 계정명은 htpasswd 파일 내부에 있어 기본 계정명 사용 여부를 자동 판정할 수 없음 — 수동 확인 필요",
  };
}

export function evaluateWEB02(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-02");

  if (!hasActiveBasicAuth(config)) {
    return { id: "WEB-02", status: "skip", evidence: "nginx에 비밀번호 기반 인증(auth_basic)이 설정되어 있지 않음" };
  }
  return {
    id: "WEB-02",
    status: "review",
    evidence: "auth_basic 인증이 설정되어 있으나 비밀번호는 해시로 저장되어 복잡도를 자동 판정할 수 없음 — 수동 확인 필요",
  };
}

// WEB-05: nginx doesn't run CGI/ISAPI directly -- script execution goes
// through fastcgi_pass/scgi_pass/uwsgi_pass. "Restricted to a designated
// location" is approximated here by whether at least one location block
// scopes execution to a specific extension (`location ~ \.php$`) rather than
// passing everything under a broad prefix location straight to the
// interpreter.
export function evaluateWEB05(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-05");

  const lines = config.split("\n").filter(isActiveLine);
  const hasScriptHandler = lines.some((line) => /\b(fastcgi_pass|scgi_pass|uwsgi_pass)\b/.test(line));
  if (!hasScriptHandler) {
    return { id: "WEB-05", status: "skip", evidence: "CGI/FastCGI 실행 설정이 발견되지 않음" };
  }

  const hasExtensionScopedLocation = lines.some((line) => /location\s*~\*?\s*\\\.[a-zA-Z0-9|()]+\$/.test(line));
  return {
    id: "WEB-05",
    status: hasExtensionScopedLocation ? "pass" : "fail",
    evidence: hasExtensionScopedLocation
      ? "CGI/FastCGI 실행이 특정 확장자로 제한된 location 블록에서만 이루어짐"
      : "CGI/FastCGI 실행을 특정 확장자로 제한하는 location(~ \\.ext$) 블록이 발견되지 않음",
  };
}

// WEB-06: the classic nginx "off-by-slash" alias misconfiguration -- a
// `location` prefix that doesn't end in "/" paired with an `alias` that does
// lets a request like "/files..%2f/etc/passwd" escape the intended
// directory. This is the concrete, nginx-native equivalent of Apache's
// "../" parent-directory-traversal item; nginx's own path normalization
// otherwise blocks literal ".." traversal by default.
export function evaluateWEB06(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-06");

  const lines = config.split("\n").filter(isActiveLine);
  const offByOne: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const locMatch = lines[i].trim().match(/^location\s+([^\s{]+)/);
    if (!locMatch) continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      if (lines[j].includes("}")) break;
      const aliasMatch = lines[j].trim().match(/^alias\s+(\S+);/);
      if (!aliasMatch) continue;
      const [, locPath] = locMatch;
      const [, aliasPath] = aliasMatch;
      if (!locPath.endsWith("/") && aliasPath.endsWith("/")) {
        offByOne.push(`${locPath} -> ${aliasPath}`);
      }
      break;
    }
  }

  return {
    id: "WEB-06",
    status: offByOne.length === 0 ? "pass" : "fail",
    evidence:
      offByOne.length === 0
        ? "상위 디렉터리 접근을 유발하는 location/alias 트레일링 슬래시 불일치가 발견되지 않음"
        : `location/alias 트레일링 슬래시 불일치(경로 탈출 위험) 발견: ${offByOne.join(", ")}`,
  };
}

function getDocRootScan(tasks: AnsibleTaskOutput[]): { leftovers: string[]; writable: string[]; missing: boolean } {
  const task = findExactTaskOutput(tasks, "nginx document root scan (internal)");
  const stdout = task?.stdout.trim() ?? "";
  // No task output at all, or the explicit "no root/alias directives found"
  // marker, means we can't scan -- but a legitimately empty scan (roots
  // found, nothing suspicious in them) also reports empty stdout and must
  // NOT be treated the same as "couldn't scan".
  if (!task || stdout === MISSING_MARKER) return { leftovers: [], writable: [], missing: true };

  const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    leftovers: lines.filter((line) => line.startsWith("LEFTOVER:")).map((line) => line.slice("LEFTOVER:".length)),
    writable: lines.filter((line) => line.startsWith("WRITABLE:")).map((line) => line.slice("WRITABLE:".length)),
    missing: false,
  };
}

export function evaluateWEB07(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-07");

  const { leftovers, missing } = getDocRootScan(tasks);
  if (missing) {
    return { id: "WEB-07", status: "skip", evidence: "웹 루트 디렉터리(root/alias)를 확인할 수 없음" };
  }
  return {
    id: "WEB-07",
    status: leftovers.length === 0 ? "pass" : "fail",
    evidence:
      leftovers.length === 0
        ? "웹 루트 디렉터리에 설치 시 기본 생성되는 불필요한 파일/디렉터리가 발견되지 않음"
        : `불필요한 파일/디렉터리 발견: ${summarizeList(leftovers)}`,
  };
}

// WEB-10: nginx being used as a reverse proxy isn't itself a finding -- the
// concrete misconfiguration this catches is a `proxy_pass` target built from
// client-controlled input (a forwarded-host header, a query parameter),
// which lets a client redirect the proxy to an arbitrary destination (SSRF).
export function evaluateWEB10(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-10");

  const proxyLines = config
    .split("\n")
    .filter(isActiveLine)
    .filter((line) => /^proxy_pass\s+/.test(line.trim()));
  if (proxyLines.length === 0) {
    return { id: "WEB-10", status: "skip", evidence: "프록시(proxy_pass) 설정이 발견되지 않음" };
  }

  const clientControlled = proxyLines.filter((line) => /\$(http_host|http_x_forwarded_host|arg_\w+|http_\w+)/i.test(line));
  return {
    id: "WEB-10",
    status: clientControlled.length === 0 ? "pass" : "fail",
    evidence:
      clientControlled.length === 0
        ? "proxy_pass 대상이 클라이언트 입력값에 의존하지 않음"
        : `proxy_pass 대상이 클라이언트가 제어 가능한 헤더/파라미터에 의존함 (SSRF 위험): ${summarizeList(clientControlled)}`,
  };
}

// WEB-11: "web path separated from other business areas" is approximated as
// "the docroot isn't a top-level system directory" -- a blunt but concrete,
// automatable proxy for a check that's otherwise about organizational
// intent we can't observe from a container alone.
const DANGEROUS_WEB_ROOTS = new Set(["/", "/etc", "/root", "/home", "/var", "/usr", "/bin", "/sbin"]);

export function evaluateWEB11(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-11");

  const rootPaths = config
    .split("\n")
    .filter(isActiveLine)
    .filter((line) => /^root\s+/.test(line.trim()))
    .map((line) => line.trim().split(/\s+/)[1]?.replace(/;$/, "").replace(/\/$/, ""))
    .filter((path): path is string => Boolean(path));
  if (rootPaths.length === 0) {
    return { id: "WEB-11", status: "skip", evidence: "root 지시어가 설정되어 있지 않음" };
  }

  const dangerous = rootPaths.filter((path) => DANGEROUS_WEB_ROOTS.has(path));
  return {
    id: "WEB-11",
    status: dangerous.length === 0 ? "pass" : "fail",
    evidence:
      dangerous.length === 0
        ? `웹 루트 경로가 시스템 영역과 분리됨: ${summarizeList(rootPaths)}`
        : `웹 루트가 시스템 영역과 분리되지 않음(위험 경로 사용): ${summarizeList(dangerous)}`,
  };
}

export function evaluateWEB12(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-12");

  const disabled = config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /^disable_symlinks\s+(on|if_not_owner)\b/.test(line.trim()));

  return {
    id: "WEB-12",
    status: disabled ? "pass" : "fail",
    evidence: disabled
      ? "disable_symlinks 설정으로 심볼릭 링크 사용이 제한됨"
      : "disable_symlinks 설정이 없어 기본값(심볼릭 링크 허용)이 적용됨",
  };
}

export function evaluateWEB14(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-14");

  const { writable, missing } = getDocRootScan(tasks);
  if (missing) {
    return { id: "WEB-14", status: "skip", evidence: "웹 루트 디렉터리(root/alias)를 확인할 수 없음" };
  }
  return {
    id: "WEB-14",
    status: writable.length === 0 ? "pass" : "fail",
    evidence:
      writable.length === 0
        ? "웹 루트 경로 내 world-writable 파일이 발견되지 않음"
        : `일반 사용자 쓰기 권한이 있는 파일 발견: ${summarizeList(writable)}`,
  };
}

// WEB-15 heuristic: multiple distinct script-handler extensions mapped at
// once (e.g. both .php and .cgi active) is a signal of leftover/legacy
// mappings, not a confirmed vulnerability -- whether each is actually still
// needed depends on the application, so this surfaces "review" rather than
// an outright fail.
export function evaluateWEB15(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-15");

  const extensions = new Set<string>();
  for (const line of config.split("\n").filter(isActiveLine)) {
    const match = line.match(/location\s*~\*?\s*\\\.\(?([a-zA-Z0-9|]+)\)?\$/);
    if (match) {
      for (const ext of match[1].split("|")) extensions.add(ext.toLowerCase());
    }
  }
  if (extensions.size === 0) {
    return { id: "WEB-15", status: "skip", evidence: "확장자 기반 스크립트 매핑이 발견되지 않음" };
  }

  const many = extensions.size > 1;
  return {
    id: "WEB-15",
    status: many ? "review" : "pass",
    evidence: many
      ? `여러 스크립트 확장자 매핑이 발견됨 — 실제 사용 여부 수동 확인 필요: ${[...extensions].join(", ")}`
      : `단일 스크립트 확장자만 매핑됨: ${[...extensions].join(", ")}`,
  };
}

export function evaluateWEB17(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-17");

  const aliasCount = config
    .split("\n")
    .filter(isActiveLine)
    .filter((line) => /^alias\s+/.test(line.trim())).length;
  if (aliasCount === 0) {
    return { id: "WEB-17", status: "pass", evidence: "alias 기반 추가 가상 경로가 없음" };
  }
  return {
    id: "WEB-17",
    status: "review",
    evidence: `alias 기반 추가 경로 ${aliasCount}개 발견 — 실제 필요 여부는 수동 확인이 필요함`,
  };
}

export function evaluateWEB24(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-24");

  const lines = config.split("\n").filter(isActiveLine);
  const uploadLocationIdx = lines.findIndex((line) => /location\s+\S*\/(upload|uploads|files)\b/i.test(line));
  if (uploadLocationIdx === -1) {
    return { id: "WEB-24", status: "skip", evidence: "별도의 업로드 경로(location)가 설정되어 있지 않음" };
  }

  const nearby = lines.slice(uploadLocationIdx, uploadLocationIdx + 8);
  const hasScriptExec = nearby.some((line) => /\b(fastcgi_pass|scgi_pass|uwsgi_pass)\b/.test(line));
  return {
    id: "WEB-24",
    status: hasScriptExec ? "fail" : "pass",
    evidence: hasScriptExec
      ? "업로드 경로 내에서 스크립트 실행(fastcgi_pass 등)이 제한되지 않음"
      : "업로드 경로가 별도로 지정되어 있고 해당 경로 내 스크립트 실행이 발견되지 않음",
  };
}

export function evaluateWEB03(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-03");

  const stdout = findTaskOutput(tasks, "WEB-03")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return {
      id: "WEB-03",
      status: "skip",
      evidence: "auth_basic_user_file(기본 인증 비밀번호 파일)이 설정되어 있지 않음",
    };
  }

  const [, mode] = stdout.split(/\s+/);
  const safe = isAtMostOwnerOnly(mode ?? "");
  return {
    id: "WEB-03",
    status: safe ? "pass" : "fail",
    evidence: safe
      ? `비밀번호 파일 권한이 안전함 (${mode})`
      : `비밀번호 파일 권한이 600을 초과함 (${mode ?? "확인 불가"})`,
  };
}

export function evaluateWEB04(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-04");

  const hasAutoindexOn = config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /\bautoindex\s+on\s*;/.test(line));

  return {
    id: "WEB-04",
    status: hasAutoindexOn ? "fail" : "pass",
    evidence: hasAutoindexOn
      ? "유효 설정에서 autoindex on 지시어가 발견됨 (디렉토리 리스팅 노출)"
      : "유효 설정에서 autoindex on 지시어가 발견되지 않음",
  };
}

// WEB-08: nginx's own compiled-in default (1m) already imposes a bound, so
// the only clearly unsafe state we can positively detect is an explicit
// override to unlimited (`client_max_body_size 0;`) -- absence of the
// directive is treated as "using the safe default", not a failure.
export function evaluateWEB08(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-08");

  const line = config
    .split("\n")
    .filter(isActiveLine)
    .find((l) => /^client_max_body_size\s+/.test(l.trim()));
  const value = line?.trim().split(/\s+/)[1]?.replace(/;$/, "");
  const unlimited = value === "0";

  return {
    id: "WEB-08",
    status: unlimited ? "fail" : "pass",
    evidence: value
      ? `client_max_body_size ${value}`
      : "client_max_body_size 미설정 (nginx 기본값 1m 적용됨)",
  };
}

// WEB-09: the nginx master process must run as root to bind privileged
// ports, so checking the live process list (like C-01's UID check) would
// always report root and produce a false fail. The `user` directive
// controls the unprivileged worker processes that actually handle requests,
// so that's what we check instead. A missing `user` directive is treated as
// a fail -- we can't positively confirm the compiled-in default is non-root.
export function evaluateWEB09(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-09");

  const userLine = config
    .split("\n")
    .filter(isActiveLine)
    .find((line) => /^user\s+/.test(line.trim()));
  const userValue = userLine?.trim().split(/\s+/)[1]?.replace(/;$/, "");
  const isRoot = !userLine || userValue === "root";

  return {
    id: "WEB-09",
    status: isRoot ? "fail" : "pass",
    evidence: userLine
      ? `user 지시어: ${userValue}`
      : "user 지시어가 없어 워커 프로세스 실행 계정을 확인할 수 없음",
  };
}

// WEB-13 heuristic: nginx has no single "protect config files" switch --
// exposure is normally prevented with a location block matching dotfiles
// (.env, .git, .htaccess-style secrets) paired with `deny all;`. Requiring
// both anywhere in the effective config is a loose but reasonable MVP proxy;
// a block targeting a different path than the deny wouldn't be caught.
export function evaluateWEB13(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-13");

  // Commented-out example blocks are extremely common here -- nginx ships a
  // "# deny access to .htaccess files ... #location ~ /\.ht { #deny all; }"
  // sample commented out by default in its own stock config, which would
  // false-pass this check without filtering to active lines first.
  const activeLines = config.split("\n").filter(isActiveLine);
  const hasDotfileLocationBlock = activeLines.some(
    (line) => /location\s*~\*?\s*(\^)?\/?\\\.(ht|env|git)/i.test(line) || /location\s*~\*?\s*\/\\\./.test(line),
  );
  const hasDenyAll = activeLines.some((line) => /deny\s+all\s*;/.test(line));
  const pass = hasDotfileLocationBlock && hasDenyAll;

  return {
    id: "WEB-13",
    status: pass ? "pass" : "fail",
    evidence: pass
      ? "숨김/설정 파일(.env, .git 등)에 대한 location + deny all 차단 설정이 발견됨"
      : "숨김/설정 파일 접근을 차단하는 location 블록이 발견되지 않음",
  };
}

export function evaluateWEB16(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-16");

  const serverTokensOff = config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /\bserver_tokens\s+off\s*;/.test(line));

  return {
    id: "WEB-16",
    status: serverTokensOff ? "pass" : "fail",
    evidence: serverTokensOff
      ? "server_tokens off 설정됨"
      : "server_tokens가 off로 설정되어 있지 않아 응답 헤더에 nginx 버전 정보가 노출될 수 있음",
  };
}

export function evaluateWEB18(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-18");

  const hasDavMethods = config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /^dav_methods\s+/.test(line.trim()));

  return {
    id: "WEB-18",
    status: hasDavMethods ? "fail" : "pass",
    evidence: hasDavMethods
      ? "dav_methods 지시어로 WebDAV(PUT/DELETE 등)가 활성화되어 있음"
      : "WebDAV(dav_methods) 설정이 발견되지 않음 (비활성화 상태)",
  };
}

export function evaluateWEB19(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-19");

  const ssiOn = config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /^ssi\s+on\s*;/.test(line.trim()));

  return {
    id: "WEB-19",
    status: ssiOn ? "fail" : "pass",
    evidence: ssiOn
      ? "ssi on 설정으로 Server Side Includes가 활성화되어 있음"
      : "SSI(ssi on) 설정이 발견되지 않음",
  };
}

export function evaluateWEB20(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-20");

  const lines = config.split("\n").filter(isActiveLine);
  const hasSslListen = lines.some((line) => /^listen\s+.*\bssl\b/.test(line.trim()));
  const hasCertificate = lines.some((line) => /^ssl_certificate\s+/.test(line.trim()));
  const pass = hasSslListen && hasCertificate;

  return {
    id: "WEB-20",
    status: pass ? "pass" : "fail",
    evidence: pass
      ? "SSL/TLS 설정(listen ssl + ssl_certificate)이 발견됨"
      : "SSL/TLS 설정(listen ssl 및 ssl_certificate)이 발견되지 않음",
  };
}

// WEB-21 only makes sense once SSL/TLS exists at all -- with nothing to
// redirect to, "no HTTPS redirect" isn't a finding, it's not applicable.
export function evaluateWEB21(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-21");

  const lines = config.split("\n").filter(isActiveLine);
  const hasSsl = lines.some((line) => /^listen\s+.*\bssl\b/.test(line.trim()));
  if (!hasSsl) {
    return { id: "WEB-21", status: "skip", evidence: "SSL/TLS가 설정되어 있지 않아 HTTPS 리디렉션 대상이 없음" };
  }

  const hasRedirect = lines.some(
    (line) => /return\s+301\s+https:\/\//.test(line) || /rewrite\s+\^.*https:\/\/.*permanent/.test(line),
  );
  return {
    id: "WEB-21",
    status: hasRedirect ? "pass" : "fail",
    evidence: hasRedirect
      ? "HTTP→HTTPS 리디렉션 설정이 발견됨"
      : "HTTPS로의 리디렉션 설정이 발견되지 않음",
  };
}

export function evaluateWEB22(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-22");

  const hasCustomErrorPage = config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /^error_page\s+/.test(line.trim()));

  return {
    id: "WEB-22",
    status: hasCustomErrorPage ? "pass" : "fail",
    evidence: hasCustomErrorPage
      ? "커스텀 error_page 설정이 발견됨"
      : "커스텀 error_page 설정이 없어 기본 에러 페이지가 노출될 수 있음",
  };
}

// WEB-23: nginx core has no built-in LDAP auth -- it requires a third-party
// module (ngx_http_auth_ldap_module) that's rarely compiled in. Absence of
// any auth_ldap/ldap_server directive means the item genuinely doesn't
// apply, not that it was overlooked. If it IS present, the specific digest
// algorithm strength can't be verified automatically from config alone.
export function evaluateWEB23(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present, config } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-23");

  const hasLdap = config
    .split("\n")
    .filter(isActiveLine)
    .some((line) => /\bauth_ldap\b|\bldap_server\b/i.test(line));
  if (!hasLdap) {
    return { id: "WEB-23", status: "skip", evidence: "nginx에 LDAP 인증 모듈(auth_ldap) 설정이 없음" };
  }
  return {
    id: "WEB-23",
    status: "review",
    evidence: "LDAP 인증 설정이 발견되었으나, 사용 중인 다이제스트 알고리즘의 안전성은 자동 판정할 수 없어 수동 확인이 필요함",
  };
}

// WEB-25 (patch management), like U-64/U-45/U-49: a static image snapshot
// has no CVE database to compare the detected version against, so this
// always surfaces "review" with the version as evidence rather than
// guessing pass/fail.
export function evaluateWEB25(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-25");

  const version = findExactTaskOutput(tasks, "nginx version (internal)")?.stdout.trim() || "확인 불가";
  return {
    id: "WEB-25",
    status: "review",
    evidence: `nginx 버전: ${version} — 정적 이미지 점검만으로는 최신 보안 패치 적용 여부를 판단할 수 없어 벤더 보안 권고사항과 수동 대조가 필요함`,
  };
}

export function evaluateWEB26(tasks: AnsibleTaskOutput[]): CheckResult {
  const { present } = getNginxState(tasks);
  if (!present) return skipNoNginx("WEB-26");

  const stdout = findTaskOutput(tasks, "WEB-26")?.stdout.trim() ?? "";
  if (!stdout || stdout === MISSING_MARKER) {
    return { id: "WEB-26", status: "skip", evidence: "nginx 로그 디렉터리(/var/log/nginx)가 존재하지 않음" };
  }

  const [ownerGroup, mode] = stdout.split(/\s+/);
  const safe = hasNoGroupOrOtherWrite(mode ?? "");
  return {
    id: "WEB-26",
    status: safe ? "pass" : "fail",
    evidence: `로그 디렉터리 소유자: ${ownerGroup ?? "확인 불가"}, 권한: ${mode ?? "확인 불가"}`,
  };
}

// Composition point: every check the pipeline runs gets added here (C/U/W).
// findings is null for the local-image fallback path (#41) — see evaluateC01.
export function evaluateAllChecks(
  findings: DockerfileFindings | null,
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
    evaluateU14(tasks),
    evaluateU15(tasks),
    evaluateU17(tasks),
    evaluateU18(tasks),
    evaluateU19(tasks),
    evaluateU20(tasks),
    evaluateU21(tasks),
    evaluateU22(tasks),
    evaluateU23(tasks),
    evaluateU24(tasks),
    evaluateU25(tasks),
    evaluateU26(tasks),
    evaluateU27(tasks),
    evaluateU28(tasks),
    evaluateU29(tasks),
    evaluateU30(tasks),
    evaluateU31(tasks),
    evaluateU32(tasks),
    evaluateU33(tasks),
    evaluateU34(tasks),
    evaluateU35(tasks),
    evaluateU36(tasks),
    evaluateU37(tasks),
    evaluateU38(tasks),
    evaluateU39(tasks),
    evaluateU40(tasks),
    evaluateU41(tasks),
    evaluateU42(tasks),
    evaluateU43(tasks),
    evaluateU44(tasks),
    evaluateU45(tasks),
    evaluateU46(tasks),
    evaluateU47(tasks),
    evaluateU48(tasks),
    evaluateU49(tasks),
    evaluateU50(tasks),
    evaluateU51(tasks),
    evaluateU52(tasks),
    evaluateU53(tasks),
    evaluateU54(tasks),
    evaluateU55(tasks),
    evaluateU56(tasks),
    evaluateU57(tasks),
    evaluateU58(tasks),
    evaluateU59(tasks),
    evaluateU60(tasks),
    evaluateU61(tasks),
    evaluateU62(tasks),
    evaluateU63(tasks),
    evaluateU64(tasks),
    evaluateU65(tasks),
    evaluateU66(tasks),
    evaluateU67(tasks),
    evaluateWEB01(tasks),
    evaluateWEB02(tasks),
    evaluateWEB03(tasks),
    evaluateWEB04(tasks),
    evaluateWEB05(tasks),
    evaluateWEB06(tasks),
    evaluateWEB07(tasks),
    evaluateWEB08(tasks),
    evaluateWEB09(tasks),
    evaluateWEB10(tasks),
    evaluateWEB11(tasks),
    evaluateWEB12(tasks),
    evaluateWEB13(tasks),
    evaluateWEB14(tasks),
    evaluateWEB15(tasks),
    evaluateWEB16(tasks),
    evaluateWEB17(tasks),
    evaluateWEB18(tasks),
    evaluateWEB19(tasks),
    evaluateWEB20(tasks),
    evaluateWEB21(tasks),
    evaluateWEB22(tasks),
    evaluateWEB23(tasks),
    evaluateWEB24(tasks),
    evaluateWEB25(tasks),
    evaluateWEB26(tasks),
  ];
}
