import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";

const MISSING = "__MISSING__";
const TNS = "$TNS_ADMIN/listener.ora /opt/oracle/*/network/admin/listener.ora /u01/*/network/admin/listener.ora /opt/oracle/product/*/*/network/admin/listener.ora";
const SQLNET = "$TNS_ADMIN/sqlnet.ora /opt/oracle/*/network/admin/sqlnet.ora /u01/*/network/admin/sqlnet.ora /opt/oracle/product/*/*/network/admin/sqlnet.ora";
const PFILE = "/opt/oracle/*/dbs/init*.ora /u01/*/dbs/init*.ora $ORACLE_HOME/dbs/init*.ora";

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
