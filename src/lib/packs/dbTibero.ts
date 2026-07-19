import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { EvalContext, PlaybookTask, ScanInputSpec, VendorPack } from "./types";

const MISSING = "__MISSING__";
// 사용자 입력(tibero_home/tibero_tbsid)은 Ansible `quote` 필터로 셸 인용해 주입한다 — 명령 주입 방지.
const TIP_PATH_QUOTED = `{{ (tibero_home + "/config/" + tibero_tbsid + ".tip") | quote }}`;

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
    raw: `p=${TIP_PATH_QUOTED}\nif [ -f "$p" ]; then cat "$p"; else echo ${MISSING}; fi` },
  { name: "TB-14: tibero tip perms",
    raw: `p=${TIP_PATH_QUOTED}\nif [ -f "$p" ]; then stat -c "%U:%G %a" "$p"; else echo ${MISSING}; fi` },
];

function taskStdout(tasks: AnsibleTaskOutput[], name: string): string {
  return tasks.find((t) => t.taskName === name)?.stdout ?? "";
}

// __MISSING__ 센티널만 "파일 없음"으로 취급한다. 실제로 존재하지만 내용이 빈 파일은
// (센티널이 아니므로) 평가 단계로 넘어가야 한다 — 그래야 "빈 .tip = ACL 없음 = fail"이
// "파일을 찾을 수 없음(review)"으로 잘못 뭉개지지 않는다.
function isMissing(stdout: string): boolean {
  return stdout.trim() === MISSING;
}

// .tip 텍스트에서 리스너 IP 접근제어 설정(LSNR_INVITED_IP/DENIED_IP 또는 파일 지정)이 있는지.
// `=` 뒤에 공백이 아닌 값이 최소 1자 있어야 "설정됨"으로 인정한다(빈 값은 미설정).
function hasListenerAcl(tip: string): boolean {
  return /^[ \t]*(LSNR_INVITED_IP|LSNR_DENIED_IP|LSNR_INVITED_IP_FILE|LSNR_DENIED_IP_FILE)[ \t]*=[ \t]*\S/im.test(tip);
}

// "user:group mode" 형태에서 mode를 파싱한다. 3자리(또는 앞에 0이 붙은 4자리) 8진수
// 표기가 아니면 파싱 실패로 null을 반환해, 호출부가 fail-closed(review)로 처리하게 한다.
function parseMode(perms: string): string | null {
  const raw = perms.trim().split(/\s+/)[1] ?? "";
  if (!/^[0-7]{3,4}$/.test(raw)) return null;
  return raw.length === 4 ? raw.slice(-3) : raw;
}

// 그룹/기타 쓰기 비트가 있으면 과다 권한.
function isOverPermissive(mode: string): boolean {
  const group = Number(mode[1]);
  const other = Number(mode[2]);
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
  detect(): boolean {
    // 서버(declared) 모드에서는 벤더 선언으로 이미 선택됐으므로 항상 true.
    return true;
  },
  evaluate(ctx: EvalContext): CheckResult[] {
    const pathProvided = ctx.inputsProvided?.has("tibero_home") && ctx.inputsProvided?.has("tibero_tbsid");
    const tipRaw = taskStdout(ctx.tasks, "TB-13: tibero tip content");
    const permsRaw = taskStdout(ctx.tasks, "TB-14: tibero tip perms");

    const tb13: CheckResult = !pathProvided
      ? { id: "TB-13", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : isMissing(tipRaw)
        ? { id: "TB-13", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : hasListenerAcl(tipRaw)
          ? { id: "TB-13", status: "pass", evidence: "리스너 IP 접근제어 설정됨" }
          : { id: "TB-13", status: "fail", evidence: "리스너 IP 접근제어(LSNR_INVITED_IP/DENIED_IP) 미설정" };

    const mode = isMissing(permsRaw) ? null : parseMode(permsRaw);
    const tb14: CheckResult = !pathProvided
      ? { id: "TB-14", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : isMissing(permsRaw)
        ? { id: "TB-14", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : mode === null
          ? { id: "TB-14", status: "review", evidence: `설정파일 권한 형식을 확인할 수 없음: ${permsRaw.trim()}` }
          : isOverPermissive(mode)
            ? { id: "TB-14", status: "fail", evidence: `설정파일 권한 과다: ${permsRaw.trim()}` }
            : { id: "TB-14", status: "pass", evidence: `설정파일 권한 양호: ${permsRaw.trim()}` };

    return [tb13, tb14];
  },
};
