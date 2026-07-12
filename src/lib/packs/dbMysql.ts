import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { PlaybookTask } from "./types";

const MISSING = "__MISSING__";

export const MYSQL_EVIDENCE: PlaybookTask[] = [
  { name: "mysql detection (internal)",
    raw: `sh -c '(command -v mysqld >/dev/null 2>&1 || command -v mariadbd >/dev/null 2>&1 || command -v mysql >/dev/null 2>&1 || [ -f /etc/mysql/my.cnf ] || [ -f /etc/my.cnf ]) && echo present || echo absent; true'` },
  { name: "mysql config (internal)",
    raw: `sh -c 'found=0; for f in /etc/mysql/my.cnf /etc/mysql/mysql.conf.d/*.cnf /etc/mysql/mariadb.conf.d/*.cnf /etc/my.cnf /etc/my.cnf.d/*.cnf; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "mysql datadir perms (internal)",
    raw: `sh -c 'D=$(grep -rhiE "^[[:space:]]*datadir" /etc/mysql /etc/my.cnf /etc/my.cnf.d 2>/dev/null | head -1 | sed "s/.*=//; s/[[:space:]]//g"); [ -z "$D" ] && D=/var/lib/mysql; if [ -d "$D" ]; then stat -c "%U:%G %a" "$D"; else echo ${MISSING}; fi; true'` },
  { name: "mysql conf perms (internal)",
    raw: `sh -c 'for f in /etc/mysql/my.cnf /etc/my.cnf; do if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; exit 0; fi; done; echo ${MISSING}; true'` },
  { name: "mysql process user (internal)",
    raw: `sh -c 'ps -eo user,args 2>/dev/null | grep -iE "mysqld|mariadbd" | grep -v grep | head -1; true'` },
  { name: "mysql version (internal)",
    raw: `sh -c 'if command -v mysqld >/dev/null 2>&1; then mysqld --version 2>&1; elif command -v mariadbd >/dev/null 2>&1; then mariadbd --version 2>&1; else echo ${MISSING}; fi; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}
function rawOut(tasks: AnsibleTaskOutput[], name: string): string {
  const s = findExact(tasks, name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// 활성(주석·빈 줄 제외) 라인. my.cnf 주석은 #, ;.
function activeLines(config: string): string[] {
  return config.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith(";") && !l.startsWith("###") && !l.startsWith("["));
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/-/g, "_");
}

// `key = value` 또는 `key value`. 하이픈/언더스코어 동일 취급, 따옴표 제거.
export function cnfValue(config: string, key: string): string | null {
  const want = normalizeKey(key);
  for (const line of activeLines(config)) {
    const eq = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    const sp = line.match(/^([A-Za-z0-9_-]+)\s+(\S.*)$/);
    const m = eq ?? sp;
    if (m && normalizeKey(m[1]) === want) {
      return m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

// 값 없는 플래그(예: skip-networking) 또는 값 있는 키의 존재 여부.
export function cnfHasFlag(config: string, key: string): boolean {
  const want = normalizeKey(key);
  return activeLines(config).some((line) => {
    const m = line.match(/^([A-Za-z0-9_-]+)/);
    return m ? normalizeKey(m[1]) === want : false;
  });
}

// datadir용 엄격 검사: group·other 어떤 권한도 없어야(750 실패, 700 통과).
export function noGroupOtherAccess(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return g === 0 && o === 0;
}

// world-writable 아님(설정 파일용): other write 비트 없음.
export function noOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  return (Number(mode.slice(-1)) & 2) === 0;
}

export function getMysqlState(tasks: AnsibleTaskOutput[]): {
  present: boolean; config: string; datadirPerms: string; confPerms: string; processLine: string; version: string;
} {
  const present = findExact(tasks, "mysql detection (internal)")?.stdout.trim() === "present";
  return {
    present,
    config: rawOut(tasks, "mysql config (internal)"),
    datadirPerms: rawOut(tasks, "mysql datadir perms (internal)").trim(),
    confPerms: rawOut(tasks, "mysql conf perms (internal)").trim(),
    processLine: (findExact(tasks, "mysql process user (internal)")?.stdout ?? "").trim(),
    version: rawOut(tasks, "mysql version (internal)").trim(),
  };
}

export function evaluateDB01(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getMysqlState(tasks).datadirPerms;
  if (!perms) return { id: "DB-01", status: "skip", evidence: "데이터 디렉터리를 확인할 수 없음" };
  const ok = noGroupOtherAccess(perms);
  return { id: "DB-01", status: ok ? "pass" : "fail", evidence: `데이터 디렉터리 권한: ${perms}` };
}

export function evaluateDB02(tasks: AnsibleTaskOutput[]): CheckResult {
  const line = getMysqlState(tasks).processLine;
  if (!line) return { id: "DB-02", status: "review", evidence: "MySQL 프로세스를 확인할 수 없어 실행 계정 판정 불가 — 수동/AI 확인" };
  const user = line.split(/\s+/)[0];
  return { id: "DB-02", status: user === "root" ? "fail" : "pass", evidence: `MySQL 실행 계정: ${user}` };
}

export function evaluateDB03(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getMysqlState(tasks).confPerms;
  if (!perms) return { id: "DB-03", status: "skip", evidence: "설정 파일을 확인할 수 없음" };
  const ok = noOtherWrite(perms);
  return { id: "DB-03", status: ok ? "pass" : "fail", evidence: `설정 파일 권한: ${perms}` };
}

export function evaluateDB04(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = cnfValue(getMysqlState(tasks).config, "log_error");
  const on = v !== null && v !== "";
  return { id: "DB-04", status: on ? "pass" : "fail", evidence: on ? `log_error 설정: ${v}` : "log_error(에러 로그)가 설정되어 있지 않음" };
}

export function evaluateDB05(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getMysqlState(tasks).config;
  const skip = cnfHasFlag(config, "skip-symbolic-links");
  const sym = cnfValue(config, "symbolic-links");
  const disabled = skip || sym === "0";
  return { id: "DB-05", status: disabled ? "pass" : "fail", evidence: disabled ? "심볼릭 링크가 비활성화됨" : `심볼릭 링크가 비활성화되어 있지 않음 (symbolic-links=${sym ?? "미설정"})` };
}

export function evaluateDB06(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = cnfValue(getMysqlState(tasks).config, "local_infile");
  const off = v !== null && /^(0|off|false)$/i.test(v);
  return { id: "DB-06", status: off ? "pass" : "fail", evidence: off ? "local_infile(LOAD DATA LOCAL)이 비활성화됨" : `local_infile이 비활성화되어 있지 않음 (${v ?? "미설정 — 기본 활성"})` };
}
