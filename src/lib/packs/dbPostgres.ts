import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { PlaybookTask } from "./types";

const MISSING = "__MISSING__";
const CONF_GLOB = "/etc/postgresql/*/main/postgresql.conf /var/lib/pgsql/*/data/postgresql.conf /var/lib/postgresql/*/main/postgresql.conf /var/lib/pgsql/data/postgresql.conf";
const HBA_GLOB = "/etc/postgresql/*/main/pg_hba.conf /var/lib/pgsql/*/data/pg_hba.conf /var/lib/postgresql/*/main/pg_hba.conf /var/lib/pgsql/data/pg_hba.conf";

export const PG_EVIDENCE: PlaybookTask[] = [
  { name: "postgres detection (internal)",
    raw: `sh -c '(command -v postgres >/dev/null 2>&1 || command -v postmaster >/dev/null 2>&1) || ls ${CONF_GLOB} >/dev/null 2>&1 && echo present || echo absent; true'` },
  { name: "postgresql.conf (internal)",
    raw: `sh -c 'found=0; for f in ${CONF_GLOB}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "pg_hba.conf (internal)",
    raw: `sh -c 'found=0; for f in ${HBA_GLOB}; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "postgres datadir perms (internal)",
    raw: `sh -c 'D=$(grep -rhiE "^[[:space:]]*data_directory" /etc/postgresql /var/lib/pgsql 2>/dev/null | head -1 | sed "s/.*=//; s/#.*//; s/[[:space:]\\x27]//g"); if [ -z "$D" ]; then for c in /var/lib/postgresql/*/main /var/lib/pgsql/*/data /var/lib/pgsql/data; do [ -d "$c" ] && D="$c" && break; done; fi; if [ -n "$D" ] && [ -d "$D" ]; then stat -c "%U:%G %a" "$D"; else echo ${MISSING}; fi; true'` },
  { name: "postgres conf perms (internal)",
    raw: `sh -c 'for f in ${CONF_GLOB}; do if [ -f "$f" ]; then stat -c "%U:%G %a" "$f"; exit 0; fi; done; echo ${MISSING}; true'` },
  { name: "postgres process user (internal)",
    raw: `sh -c 'ps -eo user,args 2>/dev/null | grep -iE "postgres|postmaster" | grep -v grep | head -1; true'` },
  { name: "postgres version (internal)",
    raw: `sh -c 'if command -v postgres >/dev/null 2>&1; then postgres --version 2>&1; elif command -v postmaster >/dev/null 2>&1; then postmaster --version 2>&1; else echo ${MISSING}; fi; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}
function rawOut(tasks: AnsibleTaskOutput[], name: string): string {
  const s = findExact(tasks, name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// postgresql.conf 활성 라인(주석 #, ### 파일구분, 빈 줄 제외; 인라인 # 제거).
function pgActiveLines(conf: string): string[] {
  return conf.split("\n")
    .map((l) => l.replace(/\s+#.*$/, "").replace(/^#.*$/, "").trim())
    .filter((l) => l && !l.startsWith("###") && !l.startsWith("#"));
}

// key = value (postgres는 = 사용). 마지막 매칭 우선(include 순). 따옴표 제거, 키 소문자.
export function pgValue(conf: string, key: string): string | null {
  const want = key.trim().toLowerCase();
  let val: string | null = null;
  for (const line of pgActiveLines(conf)) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1].toLowerCase() === want) {
      val = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return val;
}

export function pgBool(conf: string, key: string): boolean {
  const v = pgValue(conf, key);
  return v !== null && /^(on|true|1|yes)$/i.test(v);
}

export function noGroupOtherAccess(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return g === 0 && o === 0;
}
export function noOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  return (Number(mode.slice(-1)) & 2) === 0;
}

export function getPgState(tasks: AnsibleTaskOutput[]): {
  present: boolean; conf: string; hba: string; datadirPerms: string; confPerms: string; processLine: string; version: string;
} {
  return {
    present: findExact(tasks, "postgres detection (internal)")?.stdout.trim() === "present",
    conf: rawOut(tasks, "postgresql.conf (internal)"),
    hba: rawOut(tasks, "pg_hba.conf (internal)"),
    datadirPerms: rawOut(tasks, "postgres datadir perms (internal)").trim(),
    confPerms: rawOut(tasks, "postgres conf perms (internal)").trim(),
    processLine: (findExact(tasks, "postgres process user (internal)")?.stdout ?? "").trim(),
    version: rawOut(tasks, "postgres version (internal)").trim(),
  };
}

export function evaluatePG01(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getPgState(tasks).datadirPerms;
  if (!perms) return { id: "PG-01", status: "skip", evidence: "데이터 디렉터리를 확인할 수 없음" };
  const ok = noGroupOtherAccess(perms);
  return { id: "PG-01", status: ok ? "pass" : "fail", evidence: `데이터 디렉터리 권한: ${perms}` };
}
export function evaluatePG02(tasks: AnsibleTaskOutput[]): CheckResult {
  const line = getPgState(tasks).processLine;
  if (!line) return { id: "PG-02", status: "review", evidence: "PostgreSQL 프로세스를 확인할 수 없어 실행 계정 판정 불가 — 수동/AI 확인" };
  const user = line.split(/\s+/)[0];
  return { id: "PG-02", status: user === "root" ? "fail" : "pass", evidence: `PostgreSQL 실행 계정: ${user}` };
}
export function evaluatePG03(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getPgState(tasks).confPerms;
  if (!perms) return { id: "PG-03", status: "skip", evidence: "설정 파일을 확인할 수 없음" };
  return { id: "PG-03", status: noOtherWrite(perms) ? "pass" : "fail", evidence: `설정 파일 권한: ${perms}` };
}
export function evaluatePG04(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "logging_collector");
  return { id: "PG-04", status: on ? "pass" : "fail", evidence: on ? "logging_collector가 on" : "logging_collector가 off이거나 미설정" };
}
export function evaluatePG05(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = pgValue(getPgState(tasks).conf, "listen_addresses");
  const exposed = v === "*" || v === "0.0.0.0" || v === "::";
  const ok = v !== null && !exposed;
  return { id: "PG-05", status: ok ? "pass" : "fail", evidence: v === null ? "listen_addresses 미설정" : `listen_addresses: ${v}${exposed ? " (전체 노출)" : ""}` };
}
export function evaluatePG06(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "ssl");
  return { id: "PG-06", status: on ? "pass" : "fail", evidence: on ? "ssl가 on" : "ssl가 off이거나 미설정" };
}

// pg_hba.conf 활성 라인의 마지막 필드(METHOD)들. include/기타 지시어는 무시.
export function hbaMethods(hba: string): string[] {
  return hba.split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l && !l.startsWith("###") && /^(local|host|hostssl|hostnossl)\b/i.test(l))
    .map((l) => l.split(/\s+/).pop() as string)
    .filter(Boolean);
}

export function evaluatePG07(tasks: AnsibleTaskOutput[]): CheckResult {
  const methods = hbaMethods(getPgState(tasks).hba);
  if (methods.length === 0) return { id: "PG-07", status: "skip", evidence: "pg_hba.conf 규칙을 확인할 수 없음" };
  const trust = methods.filter((m) => /^trust$/i.test(m));
  return { id: "PG-07", status: trust.length ? "fail" : "pass", evidence: trust.length ? "pg_hba.conf에 trust 인증이 사용됨" : "pg_hba.conf에 trust 인증이 없음" };
}
export function evaluatePG08(tasks: AnsibleTaskOutput[]): CheckResult {
  const v = pgValue(getPgState(tasks).conf, "password_encryption");
  const ok = v !== null && /^scram-sha-256$/i.test(v);
  return { id: "PG-08", status: ok ? "pass" : "fail", evidence: ok ? "password_encryption=scram-sha-256" : `password_encryption: ${v ?? "미설정"}` };
}
export function evaluatePG09(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "log_connections");
  return { id: "PG-09", status: on ? "pass" : "fail", evidence: on ? "log_connections가 on" : "log_connections가 off이거나 미설정" };
}
export function evaluatePG10(tasks: AnsibleTaskOutput[]): CheckResult {
  const on = pgBool(getPgState(tasks).conf, "log_disconnections");
  return { id: "PG-10", status: on ? "pass" : "fail", evidence: on ? "log_disconnections가 on" : "log_disconnections가 off이거나 미설정" };
}
export function evaluatePG11(): CheckResult {
  return { id: "PG-11", status: "review", evidence: "슈퍼유저/과다 권한 역할은 라이브 SQL(pg_roles) 확인이 필요 — 수동 점검" };
}
export function evaluatePG12(tasks: AnsibleTaskOutput[]): CheckResult {
  const version = getPgState(tasks).version || "확인 불가";
  return { id: "PG-12", status: "review", evidence: `PostgreSQL 버전: ${version} — 정적 점검만으로 최신 패치 적용 여부를 단정할 수 없어 벤더 권고와 대조 필요` };
}
