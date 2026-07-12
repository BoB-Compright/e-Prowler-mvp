import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { PlaybookTask } from "./types";
import { getCatalogByCategory } from "@/lib/catalog";
import type { EvalContext, VendorPack } from "./types";

const MISSING = "__MISSING__";
const TNS = "$TNS_ADMIN/listener.ora /opt/oracle/*/network/admin/listener.ora /u01/*/network/admin/listener.ora /opt/oracle/product/*/*/network/admin/listener.ora /u01/app/oracle/product/*/*/network/admin/listener.ora";
const SQLNET = "$TNS_ADMIN/sqlnet.ora /opt/oracle/*/network/admin/sqlnet.ora /u01/*/network/admin/sqlnet.ora /opt/oracle/product/*/*/network/admin/sqlnet.ora /u01/app/oracle/product/*/*/network/admin/sqlnet.ora";
const PFILE = "/opt/oracle/*/dbs/init*.ora /u01/*/dbs/init*.ora $ORACLE_HOME/dbs/init*.ora /opt/oracle/product/*/*/dbs/init*.ora /u01/app/oracle/product/*/*/dbs/init*.ora";

export const ORACLE_EVIDENCE: PlaybookTask[] = [
  { name: "oracle detection (internal)",
    raw: `sh -c 'p=absent; if command -v tnslsnr >/dev/null 2>&1 || command -v sqlplus >/dev/null 2>&1 || [ -f /etc/oratab ]; then p=present; else for f in ${TNS}; do [ -f "$f" ] && p=present && break; done; fi; echo "$p"; true'` },
  { name: "oracle listener.ora (internal)",
    raw: `sh -c 'found=0; for f in ${TNS}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "oracle sqlnet.ora (internal)",
    raw: `sh -c 'found=0; for f in ${SQLNET}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "oracle init pfile (internal)",
    raw: `sh -c 'found=0; for f in ${PFILE}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "oracle home perms (internal)",
    raw: `sh -c 'H="$ORACLE_HOME"; if [ -z "$H" ]; then for c in /opt/oracle/product/*/* /u01/app/oracle/product/*/*; do [ -d "$c" ] && H="$c" && break; done; fi; if [ -n "$H" ] && [ -d "$H" ]; then stat -c "%U:%G %a" "$H"; else echo ${MISSING}; fi; true'` },
  { name: "oracle listener.ora perms (internal)",
    raw: `sh -c 'for f in ${TNS}; do if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; exit 0; fi; done; echo ${MISSING}; true'` },
  { name: "oracle process user (internal)",
    raw: `sh -c 'ps -eo user,args 2>/dev/null | grep -iE "tnslsnr|ora_pmon|_pmon_" | grep -v grep | head -1; true'` },
  { name: "oracle version (internal)",
    raw: `sh -c 'if command -v sqlplus >/dev/null 2>&1; then sqlplus -V 2>&1 | head -1; elif command -v tnslsnr >/dev/null 2>&1; then tnslsnr version 2>&1 | head -1; else echo ${MISSING}; fi; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}
function rawOut(tasks: AnsibleTaskOutput[], name: string): string {
  const s = findExact(tasks, name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// 주석(#) 제거한 원본 텍스트(대소문자 유지, ### 파일구분 라인 제거).
export function oraActiveText(text: string): string {
  return text.split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .filter((l) => !l.trim().startsWith("###"))
    .join("\n");
}

// key = value, 마지막 매칭, 대소문자 무시, 따옴표 제거. Oracle 파라미터명은 점(.) 포함 가능.
export function oraValue(text: string, key: string): string | null {
  const want = key.trim().toLowerCase();
  let val: string | null = null;
  for (const line of oraActiveText(text).split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)$/);
    if (m && m[1].toLowerCase() === want) {
      val = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return val;
}

export function oraHas(text: string, re: RegExp): boolean {
  return re.test(oraActiveText(text));
}

export function noGroupOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return (g & 2) === 0 && (o & 2) === 0;
}

export function getOracleState(tasks: AnsibleTaskOutput[]): {
  present: boolean; listener: string; sqlnet: string; pfile: string; homePerms: string; listenerPerms: string; processLine: string; version: string;
} {
  return {
    present: findExact(tasks, "oracle detection (internal)")?.stdout.trim() === "present",
    listener: rawOut(tasks, "oracle listener.ora (internal)"),
    sqlnet: rawOut(tasks, "oracle sqlnet.ora (internal)"),
    pfile: rawOut(tasks, "oracle init pfile (internal)"),
    homePerms: rawOut(tasks, "oracle home perms (internal)").trim(),
    listenerPerms: rawOut(tasks, "oracle listener.ora perms (internal)").trim(),
    processLine: (findExact(tasks, "oracle process user (internal)")?.stdout ?? "").trim(),
    version: rawOut(tasks, "oracle version (internal)").trim(),
  };
}

export function evaluateORA01(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getOracleState(tasks).homePerms;
  if (!perms) return { id: "ORA-01", status: "skip", evidence: "ORACLE_HOME을 확인할 수 없음" };
  return { id: "ORA-01", status: noGroupOtherWrite(perms) ? "pass" : "fail", evidence: `ORACLE_HOME 권한: ${perms}` };
}
export function evaluateORA02(tasks: AnsibleTaskOutput[]): CheckResult {
  const line = getOracleState(tasks).processLine;
  if (!line) return { id: "ORA-02", status: "review", evidence: "Oracle 프로세스를 확인할 수 없어 실행 계정 판정 불가 — 수동/AI 확인" };
  const user = line.split(/\s+/)[0];
  return { id: "ORA-02", status: user === "root" ? "fail" : "pass", evidence: `Oracle 실행 계정: ${user}` };
}
export function evaluateORA03(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getOracleState(tasks).listenerPerms;
  if (!perms) return { id: "ORA-03", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  return { id: "ORA-03", status: noGroupOtherWrite(perms) ? "pass" : "fail", evidence: `listener.ora 권한: ${perms}` };
}
export function evaluateORA04(tasks: AnsibleTaskOutput[]): CheckResult {
  const { listener } = getOracleState(tasks);
  if (!listener) return { id: "ORA-04", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  const ok = oraHas(listener, /ADMIN_RESTRICTIONS_\w+\s*=\s*(on|true|yes)/i);
  return { id: "ORA-04", status: ok ? "pass" : "fail", evidence: ok ? "ADMIN_RESTRICTIONS가 ON" : "ADMIN_RESTRICTIONS가 설정되어 있지 않음" };
}
export function evaluateORA05(tasks: AnsibleTaskOutput[]): CheckResult {
  const { listener } = getOracleState(tasks);
  if (!listener) return { id: "ORA-05", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  const extproc = oraHas(listener, /extproc/i);
  return { id: "ORA-05", status: extproc ? "fail" : "pass", evidence: extproc ? "리스너에 외부 프로시저(extproc) 등록이 있음" : "extproc 등록이 없음" };
}
export function evaluateORA06(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = oraValue(getOracleState(tasks).sqlnet, "SQLNET.AUTHENTICATION_SERVICES");
  const ok = v !== null && v !== "";
  return { id: "ORA-06", status: ok ? "pass" : "fail", evidence: ok ? `SQLNET.AUTHENTICATION_SERVICES: ${v}` : "SQLNET.AUTHENTICATION_SERVICES가 설정되어 있지 않음" };
}
export function evaluateORA07(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = oraValue(getOracleState(tasks).sqlnet, "SQLNET.ENCRYPTION_SERVER");
  const ok = v !== null && /^(required|requested)$/i.test(v.trim());
  return { id: "ORA-07", status: ok ? "pass" : "fail", evidence: v === null ? "SQLNET.ENCRYPTION_SERVER가 설정되어 있지 않음" : `SQLNET.ENCRYPTION_SERVER: ${v}${ok ? "" : " (암호화 미강제)"}` };
}
export function evaluateORA08(tasks: AnsibleTaskOutput[]): CheckResult {
  const { listener } = getOracleState(tasks);
  if (!listener) return { id: "ORA-08", status: "skip", evidence: "listener.ora를 확인할 수 없음" };
  const off = oraHas(listener, /LOGGING_\w+\s*=\s*off/i);
  return { id: "ORA-08", status: off ? "fail" : "pass", evidence: off ? "리스너 로깅이 OFF로 설정됨" : "리스너 로깅이 비활성화되어 있지 않음" };
}
const SPFILE_POINTER_RE = /^\s*spfile\s*=/im;

export function evaluateORA09(tasks: AnsibleTaskOutput[]): CheckResult {
  const { pfile } = getOracleState(tasks);
  if (!pfile || SPFILE_POINTER_RE.test(pfile)) return { id: "ORA-09", status: "review", evidence: "init pfile을 확인할 수 없거나 spfile 포인터만 존재함(실제 파라미터는 바이너리 spfile에 있음) — audit_trail은 라이브 확인 필요(수동/AI)" };
  const v = oraValue(pfile, "audit_trail");
  const ok = v !== null && !/^(none|false)$/i.test(v);
  return { id: "ORA-09", status: ok ? "pass" : "fail", evidence: `audit_trail: ${v ?? "미설정"}` };
}
export function evaluateORA10(tasks: AnsibleTaskOutput[]): CheckResult {
  const { pfile } = getOracleState(tasks);
  if (!pfile || SPFILE_POINTER_RE.test(pfile)) return { id: "ORA-10", status: "review", evidence: "init pfile을 확인할 수 없거나 spfile 포인터만 존재함(실제 파라미터는 바이너리 spfile에 있음) — remote_login_passwordfile은 라이브 확인 필요(수동/AI)" };
  const v = oraValue(pfile, "remote_login_passwordfile");
  const ok = v !== null && /^(exclusive|none)$/i.test(v);
  return { id: "ORA-10", status: ok ? "pass" : "fail", evidence: `remote_login_passwordfile: ${v ?? "미설정"}` };
}
export function evaluateORA11(): CheckResult {
  return { id: "ORA-11", status: "review", evidence: "기본 계정/권한(예: 기본 비밀번호, 과다 권한)은 라이브 SQL(dba_users) 확인이 필요 — 수동 점검" };
}
export function evaluateORA12(tasks: AnsibleTaskOutput[]): CheckResult {
  const version = getOracleState(tasks).version || "확인 불가";
  return { id: "ORA-12", status: "review", evidence: `Oracle 버전: ${version} — 정적 점검만으로 최신 패치(PSU/RU) 적용 여부를 단정할 수 없어 벤더 권고와 대조 필요` };
}

function evaluateOracle(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    evaluateORA01(t), evaluateORA02(t), evaluateORA03(t), evaluateORA04(t), evaluateORA05(t), evaluateORA06(t),
    evaluateORA07(t), evaluateORA08(t), evaluateORA09(t), evaluateORA10(t), evaluateORA11(), evaluateORA12(t),
  ];
}

export const dbOraclePack: VendorPack = {
  id: "db-oracle",
  category: "DB",
  vendors: ["Oracle"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("db").map((i) => i.id).filter((id) => id.startsWith("ORA-")),
  evidenceTasks: ORACLE_EVIDENCE,
  detect: (tasks) => getOracleState(tasks).present,
  evaluate: evaluateOracle,
};
