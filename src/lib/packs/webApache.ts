import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";
import type { CheckResult } from "@/lib/checks/types";

const MISSING = "__MISSING__";

// Apache 고유 증거 수집. name은 팩 내 유일하며 평가기는 정확한 이름으로 조회한다.
// 모든 커맨드는 raw + `; true`로 부재/비정상 종료를 흡수한다. Debian(apache2)과
// RHEL(httpd) 레이아웃을 모두 시도해 존재하는 것만 사용한다.
export const APACHE_EVIDENCE: PlaybookTask[] = [
  { name: "apache detection (internal)",
    raw: `sh -c '(command -v apache2 >/dev/null 2>&1 || command -v httpd >/dev/null 2>&1) && { [ -d /etc/apache2 ] || [ -d /etc/httpd ]; } && echo present || echo absent; true'` },
  { name: "apache modules (internal)",
    raw: `sh -c 'if command -v apache2ctl >/dev/null 2>&1; then apache2ctl -M 2>/dev/null; elif command -v httpd >/dev/null 2>&1; then httpd -M 2>/dev/null; else echo ${MISSING}; fi; true'` },
  { name: "apache effective config (internal)",
    raw: `sh -c 'found=0; for f in /etc/apache2/apache2.conf /etc/apache2/ports.conf /etc/apache2/conf-enabled/*.conf /etc/apache2/mods-enabled/*.conf /etc/apache2/sites-enabled/*.conf /etc/httpd/conf/httpd.conf /etc/httpd/conf.d/*.conf; do if [ -f "$f" ]; then found=1; echo "### $f"; cat "$f"; fi; done; [ "$found" -eq 0 ] && echo ${MISSING}; true'` },
  { name: "apache version (internal)",
    raw: `sh -c 'if command -v apache2ctl >/dev/null 2>&1; then apache2ctl -v 2>&1; elif command -v httpd >/dev/null 2>&1; then httpd -v 2>&1; else echo ${MISSING}; fi; true'` },
  { name: "apache document root scan (internal)",
    raw: `sh -c 'ROOTS=$(grep -rhiE "^[[:space:]]*DocumentRoot" /etc/apache2 /etc/httpd 2>/dev/null | awk "{print \\$2}" | tr -d "\\"" | sort -u); if [ -z "$ROOTS" ]; then echo ${MISSING}; else for r in $ROOTS; do if [ -d "$r" ]; then find "$r" -maxdepth 3 \\( -iname "phpinfo.php" -o -iname "install.php" -o -iname "readme*" -o -iname "changelog*" -o -iname "license*" -o -iname ".git" -o -iname ".svn" -o -iname ".env" \\) 2>/dev/null | sed "s/^/LEFTOVER:/"; find "$r" -maxdepth 5 -type f -perm -0002 2>/dev/null | sed "s/^/WRITABLE:/"; fi; done; fi; true'` },
  { name: "WEB-03: apache auth password file permissions",
    raw: `sh -c 'F=$(grep -rhiE "^[[:space:]]*AuthUserFile" /etc/apache2 /etc/httpd 2>/dev/null | head -1 | awk "{print \\$2}" | tr -d "\\""); if [ -n "$F" ] && [ -e "$F" ]; then stat -c "%U:%G %a" "$F"; else echo ${MISSING}; fi; true'` },
  { name: "WEB-26: apache log directory permissions",
    raw: `sh -c 'for d in /var/log/apache2 /var/log/httpd; do if [ -d "$d" ]; then stat -c "%U:%G %a" "$d"; exit 0; fi; done; echo ${MISSING}; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}

export function activeLines(config: string): string[] {
  return config.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
}

// `apache2ctl -M` 출력은 " ssl_module (shared)" 형태. 모듈명만 추출한다.
function parseModules(stdout: string): string[] {
  if (stdout.trim() === MISSING) return [];
  return stdout.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((m) => /_module$/.test(m));
}

export function moduleLoaded(modules: string[], name: string): boolean {
  return modules.includes(name);
}

export function getApacheState(tasks: AnsibleTaskOutput[]): { present: boolean; config: string; modules: string[] } {
  const present = findExact(tasks, "apache detection (internal)")?.stdout.trim() === "present";
  const rawConfig = findExact(tasks, "apache effective config (internal)")?.stdout ?? "";
  const config = rawConfig.trim() === MISSING ? "" : rawConfig;
  const modules = parseModules(findExact(tasks, "apache modules (internal)")?.stdout ?? "");
  return { present, config, modules };
}

export function getApacheDocRootScan(tasks: AnsibleTaskOutput[]): { leftovers: string[]; writable: string[]; missing: boolean } {
  const task = findExact(tasks, "apache document root scan (internal)");
  const stdout = task?.stdout.trim() ?? "";
  if (!task || stdout === MISSING) return { leftovers: [], writable: [], missing: true };
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    leftovers: lines.filter((l) => l.startsWith("LEFTOVER:")).map((l) => l.slice(9)),
    writable: lines.filter((l) => l.startsWith("WRITABLE:")).map((l) => l.slice(9)),
    missing: false,
  };
}

// 로그/권한 stat 공용: "%U:%G %a" 문자열에서 group/other가 접근할 수 없으면 양호.
export function statNoGroupOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return g === 0 && o === 0;
}

function hasBasicAuth(config: string): boolean {
  return activeLines(config).some((l) => /^AuthType\s+Basic/i.test(l) || /^AuthUserFile\s+/i.test(l));
}

export function evaluateApacheWEB01(tasks: AnsibleTaskOutput[]): CheckResult {
  const { config } = getApacheState(tasks);
  if (!hasBasicAuth(config)) return { id: "WEB-01", status: "skip", evidence: "Apache에 기본인증(AuthType Basic) 구간이 설정되어 있지 않음" };
  return { id: "WEB-01", status: "review", evidence: "기본인증이 설정되어 있으나 계정명은 htpasswd 파일 내부에 있어 기본 계정명 사용 여부를 자동 판정할 수 없음 — 수동 확인 필요" };
}

export function evaluateApacheWEB02(tasks: AnsibleTaskOutput[]): CheckResult {
  const { config } = getApacheState(tasks);
  if (!hasBasicAuth(config)) return { id: "WEB-02", status: "skip", evidence: "Apache에 비밀번호 기반 인증(AuthType Basic)이 설정되어 있지 않음" };
  return { id: "WEB-02", status: "review", evidence: "기본인증이 설정되어 있으나 비밀번호는 해시로 저장되어 복잡도를 자동 판정할 수 없음 — 수동 확인 필요" };
}

export function evaluateApacheWEB03(tasks: AnsibleTaskOutput[]): CheckResult {
  const stat = tasks.find((t) => t.taskName === "WEB-03: apache auth password file permissions")?.stdout.trim() ?? "";
  if (!stat || stat === "__MISSING__") return { id: "WEB-03", status: "skip", evidence: "AuthUserFile(비밀번호 파일)이 설정/발견되지 않음" };
  const ok = statNoGroupOtherWrite(stat);
  return { id: "WEB-03", status: ok ? "pass" : "fail", evidence: `AuthUserFile 권한: ${stat}` };
}
