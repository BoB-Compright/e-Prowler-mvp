import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { EvalContext, PlaybookTask, ScanInputSpec, VendorPack } from "./types";

const MISSING = "__MISSING__";
// 설정파일 경로는 입력값으로 조합: {tibero_home}/config/{tibero_tbsid}.tip
const TIP = "{{ tibero_home }}/config/{{ tibero_tbsid }}.tip";

const REQUIRED_INPUTS: ScanInputSpec[] = [
  { name: "tibero_home", label: "설치 경로(TB_HOME)", kind: "path", required: true, placeholder: "/home/tibero/tibero7" },
  { name: "tibero_tbsid", label: "인스턴스(TB_SID)", kind: "text", required: true, placeholder: "tibero" },
  { name: "tibero_db_user", label: "DB 계정", kind: "text", required: true, help: "DBA 권한 계정(예: sys)", placeholder: "sys" },
  { name: "tibero_db_pass", label: "DB 비밀번호", kind: "secret", required: true, help: "tbSQL 로그인용(암호화 저장)" },
  { name: "tibero_listener_port", label: "리스너 포트", kind: "text", required: false, placeholder: "8629" },
];

// 파일기반 증거만(플랜 1). DB 로그인 쿼리(TB-01~12)는 플랜 2.
const EVIDENCE: PlaybookTask[] = [
  { name: "TB-13: tibero tip content",
    raw: `sh -c 'f="${TIP}"; if [ -f "$f" ]; then cat "$f"; else echo ${MISSING}; fi; true'` },
  { name: "TB-14: tibero tip perms",
    raw: `sh -c 'f="${TIP}"; if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; else echo ${MISSING}; fi; true'` },
];

function out(tasks: AnsibleTaskOutput[], name: string): string {
  const s = tasks.find((t) => t.taskName === name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// .tip 텍스트에서 리스너 IP 접근제어 설정(LSNR_INVITED_IP/DENIED_IP 또는 파일 지정)이 있는지.
function hasListenerAcl(tip: string): boolean {
  return /^\s*(LSNR_INVITED_IP|LSNR_DENIED_IP|LSNR_INVITED_IP_FILE|LSNR_DENIED_IP_FILE)\s*=/im.test(tip);
}

// "user:group mode"에서 그룹/기타 쓰기 비트가 있으면 과다 권한.
function isOverPermissive(perms: string): boolean {
  const mode = perms.trim().split(/\s+/)[1] ?? "";
  const m = mode.length === 3 ? mode : mode.slice(-3);
  const group = Number(m[1] ?? "0");
  const other = Number(m[2] ?? "0");
  return (group & 2) === 2 || (other & 2) === 2; // 쓰기 비트
}

export const tiberoPack: VendorPack = {
  id: "tibero",
  category: "DB",
  vendors: ["Tibero"],
  executionPath: "linux",
  itemIds: ["TB-13", "TB-14"],
  requiredInputs: REQUIRED_INPUTS,
  evidenceTasks: EVIDENCE,
  detect(tasks: AnsibleTaskOutput[]): boolean {
    // 서버(declared) 모드에서는 벤더 선언으로 이미 선택됐으므로 항상 true.
    return true;
  },
  evaluate(ctx: EvalContext): CheckResult[] {
    const pathProvided = ctx.inputsProvided?.has("tibero_home") && ctx.inputsProvided?.has("tibero_tbsid");
    const tip = out(ctx.tasks, "TB-13: tibero tip content");
    const perms = out(ctx.tasks, "TB-14: tibero tip perms");

    const tb13: CheckResult = !pathProvided
      ? { id: "TB-13", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : !tip
        ? { id: "TB-13", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : hasListenerAcl(tip)
          ? { id: "TB-13", status: "pass", evidence: "리스너 IP 접근제어 설정됨" }
          : { id: "TB-13", status: "fail", evidence: "리스너 IP 접근제어(LSNR_INVITED_IP/DENIED_IP) 미설정" };

    const tb14: CheckResult = !pathProvided
      ? { id: "TB-14", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : !perms
        ? { id: "TB-14", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : isOverPermissive(perms)
          ? { id: "TB-14", status: "fail", evidence: `설정파일 권한 과다: ${perms.trim()}` }
          : { id: "TB-14", status: "pass", evidence: `설정파일 권한 양호: ${perms.trim()}` };

    return [tb13, tb14];
  },
};
