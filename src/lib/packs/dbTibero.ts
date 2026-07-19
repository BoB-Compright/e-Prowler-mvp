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

// tbSQL 접속 변수는 quote 필터로 셸 인용해 변수에 담고, 비밀번호는 argv가 아닌
// CONN(stdin)으로 전달한다 — ps 노출·명령 주입 모두 방지.
const DBUSER_Q = `{{ tibero_db_user | quote }}`;
const DBPASS_Q = `{{ tibero_db_pass | quote }}`;
const TBSID_Q = `{{ tibero_tbsid | quote }}`;

// TB-02: SYS 기본 비밀번호(tibero)로 로그인 시도. 성공하면 기본비번 사용(취약).
// 기본비번 문자열은 사용자 입력이 아니지만 형식 일관성 위해 리터럴로 둔다.
const SYS_DEFAULT_LOGIN: PlaybookTask = {
  name: "TB-DB: tibero sys default login",
  raw: [
    `s=${TBSID_Q}`,
    `out=$(printf 'CONN SYS/tibero@%s\\nPROMPT __SYSLOGIN_OK__\\nEXIT\\n' "$s" | tbsql -s /nolog 2>&1)`,
    `if printf '%s' "$out" | grep -q __SYSLOGIN_OK__; then echo __SYS_DEFAULT_PW__; else echo __SYS_DEFAULT_PW_ABSENT__; fi`,
  ].join("\n"),
};

// TB-01/03~12: 사용자 제공 DBA 계정으로 접속해 시스템 뷰·파라미터를 한 세션에서 조회.
// 각 결과 앞에 ###TBnn 마커를 찍어 evaluate가 섹션을 분리한다. 접속 성공 시에만 마커가 나온다.
const DB_QUERIES: PlaybookTask = {
  name: "TB-DB: tibero queries",
  raw: [
    `u=${DBUSER_Q}`,
    `p=${DBPASS_Q}`,
    `s=${TBSID_Q}`,
    `{`,
    `  printf 'CONN %s/%s@%s\\n' "$u" "$p" "$s"`,
    `  printf 'SET HEADING OFF FEEDBACK OFF PAGESIZE 0 LINESIZE 300\\n'`,
    `  printf 'PROMPT __CONN_OK__\\n'`,
    `  printf 'PROMPT ###TB01\\n'`,
    `  printf "SELECT username||'|'||account_status FROM dba_users;\\n"`,
    `  printf 'PROMPT ###TB03\\n'`,
    `  printf "SELECT grantee FROM dba_role_privs WHERE granted_role='DBA';\\n"`,
    `  printf 'PROMPT ###TB04\\n'`,
    `  printf "SELECT grantee||'|'||privilege FROM dba_sys_privs WHERE privilege LIKE '%%ANY%%';\\n"`,
    `  printf 'PROMPT ###TBPROF\\n'`,
    `  printf "SELECT profile||'|'||resource_name||'|'||limit FROM dba_profiles WHERE resource_name IN ('FAILED_LOGIN_ATTEMPTS','PASSWORD_LOCK_TIME','PASSWORD_LIFE_TIME','PASSWORD_REUSE_TIME','PASSWORD_REUSE_MAX','PASSWORD_VERIFY_FUNCTION','SESSIONS_PER_USER');\\n"`,
    `  printf 'PROMPT ###TB11\\n'`,
    `  printf "SELECT name||'|'||value FROM v\\$parameter WHERE name IN ('audit_trail','audit_sys_operations');\\n"`,
    `  printf 'EXIT\\n'`,
    `} | tbsql -s /nolog 2>&1`,
  ].join("\n"),
};

// 파일기반 증거(TB-13/14) + tbSQL 인증 쿼리 evidence(TB-01/02~12, 안전 접속).
// evaluate()의 TB-01~12 판정 로직은 다음 태스크에서 추가된다.
const EVIDENCE: PlaybookTask[] = [
  { name: "TB-13: tibero tip content",
    raw: `p=${TIP_PATH_QUOTED}\nif [ -f "$p" ]; then cat "$p"; else echo ${MISSING}; fi` },
  { name: "TB-14: tibero tip perms",
    raw: `p=${TIP_PATH_QUOTED}\nif [ -f "$p" ]; then stat -c "%U:%G %a" "$p"; else echo ${MISSING}; fi` },
  SYS_DEFAULT_LOGIN,
  DB_QUERIES,
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
  itemIds: ["TB-01", "TB-02", "TB-03", "TB-04", "TB-05", "TB-06", "TB-07", "TB-08", "TB-09", "TB-10", "TB-11", "TB-12", "TB-13", "TB-14"],
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
