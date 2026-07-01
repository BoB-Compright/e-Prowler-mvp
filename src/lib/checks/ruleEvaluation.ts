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

export function evaluateFirstWaveChecks(
  findings: DockerfileFindings,
  tasks: AnsibleTaskOutput[],
): CheckResult[] {
  return [evaluateC01(findings, tasks), evaluateC02(findings), evaluateU16(tasks)];
}
