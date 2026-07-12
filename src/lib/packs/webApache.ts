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

// 로그 디렉터리(WEB-26)용: group/other에 쓰기 비트가 없으면 양호(예: 750 OK, 777 취약).
export function statNoGroupOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return (g & 2) === 0 && (o & 2) === 0;
}

// 비밀번호 파일(WEB-03)용: 소유자 전용(group·other 권한 전무)이어야 양호 (600/400 OK, 640/644 취약).
export function isOwnerOnly(statLine: string): boolean {
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
  const ok = isOwnerOnly(stat);
  return { id: "WEB-03", status: ok ? "pass" : "fail", evidence: `AuthUserFile 권한: ${stat}` };
}

export function evaluateApacheWEB04(tasks: AnsibleTaskOutput[]): CheckResult {
  const { config, modules } = getApacheState(tasks);
  const lines = activeLines(config);
  // `Options ... Indexes`가 활성(명시적 `-Indexes`가 아닌)이고 autoindex 모듈이 로드된 경우 취약.
  const indexesOn = lines.some((l) => /^Options\b/i.test(l) && /(^|\s)\+?Indexes\b/i.test(l) && !/-Indexes\b/i.test(l));
  const fail = indexesOn && moduleLoaded(modules, "autoindex_module");
  return { id: "WEB-04", status: fail ? "fail" : "pass", evidence: fail ? "디렉터리 리스팅(Options Indexes + mod_autoindex)이 활성화되어 있음" : "디렉터리 리스팅이 비활성(Indexes 미사용 또는 mod_autoindex 미로드)" };
}

export function evaluateApacheWEB05(): CheckResult {
  return { id: "WEB-05", status: "review", evidence: "CGI/스크립트 핸들러의 지정 범위 적정성은 서비스 맥락 판단이 필요 — 수동 확인" };
}

export function evaluateApacheWEB06(tasks: AnsibleTaskOutput[]): CheckResult {
  const lines = activeLines(getApacheState(tasks).config);
  // 루트 <Directory /> 블록에서 기본 접근 거부(Require all denied 또는 Deny from all)를 선언했는지.
  let inRoot = false, denied = false;
  for (const l of lines) {
    if (/^<Directory\s+\/>/i.test(l)) inRoot = true;
    else if (/^<\/Directory>/i.test(l)) inRoot = false;
    else if (inRoot && (/^Require\s+all\s+denied/i.test(l) || /^Deny\s+from\s+all/i.test(l))) denied = true;
  }
  return { id: "WEB-06", status: denied ? "pass" : "fail", evidence: denied ? "루트 디렉터리(<Directory />)에 기본 접근 거부가 설정됨" : "루트 디렉터리(<Directory />) 기본 접근 거부(Require all denied)가 확인되지 않음" };
}

export function evaluateApacheWEB07(tasks: AnsibleTaskOutput[]): CheckResult {
  const { leftovers, missing } = getApacheDocRootScan(tasks);
  if (missing) return { id: "WEB-07", status: "skip", evidence: "웹 루트(DocumentRoot)를 확인할 수 없음" };
  return { id: "WEB-07", status: leftovers.length === 0 ? "pass" : "fail", evidence: leftovers.length === 0 ? "웹 루트에 불필요한 설치/샘플 파일이 발견되지 않음" : `불필요 파일 발견: ${leftovers.join(", ")}` };
}

export function evaluateApacheWEB08(): CheckResult {
  return { id: "WEB-08", status: "review", evidence: "업로드/다운로드 용량 제한(LimitRequestBody) 값의 적정성은 조직 기준 판단 필요 — 수동 확인" };
}

export function evaluateApacheWEB09(tasks: AnsibleTaskOutput[]): CheckResult {
  const userLine = activeLines(getApacheState(tasks).config).find((l) => /^User\s+/i.test(l));
  if (!userLine) return { id: "WEB-09", status: "skip", evidence: "User 지시어가 설정에서 발견되지 않음" };
  const user = userLine.split(/\s+/)[1];
  const isRoot = user === "root" || user === "#0";
  return { id: "WEB-09", status: isRoot ? "fail" : "pass", evidence: `웹 서비스 실행 계정(User): ${user}` };
}

export function evaluateApacheWEB10(tasks: AnsibleTaskOutput[]): CheckResult {
  const { modules } = getApacheState(tasks);
  const proxy = ["proxy_module", "proxy_http_module", "proxy_ftp_module", "proxy_connect_module"].some((m) => moduleLoaded(modules, m));
  return { id: "WEB-10", status: proxy ? "fail" : "pass", evidence: proxy ? "프록시 모듈(mod_proxy 계열)이 로드되어 있음 — 불필요 시 제거 필요" : "프록시 모듈이 로드되어 있지 않음" };
}

export function evaluateApacheWEB11(): CheckResult {
  return { id: "WEB-11", status: "review", evidence: "웹 서비스 경로(DocumentRoot) 설정 적정성은 맥락 판단 필요 — 수동 확인" };
}

export function evaluateApacheWEB12(tasks: AnsibleTaskOutput[]): CheckResult {
  const lines = activeLines(getApacheState(tasks).config);
  const hasFollow = lines.some((l) => /^Options\b/i.test(l) && /(^|\s)\+?FollowSymLinks\b/i.test(l));
  const hasOwnerMatch = lines.some((l) => /SymLinksIfOwnerMatch/i.test(l));
  const fail = hasFollow && !hasOwnerMatch;
  return { id: "WEB-12", status: fail ? "fail" : "pass", evidence: fail ? "FollowSymLinks가 SymLinksIfOwnerMatch 없이 활성화됨(심볼릭 링크 악용 위험)" : "심볼릭 링크 사용이 제한됨(FollowSymLinks 미사용 또는 OwnerMatch 병용)" };
}

export function evaluateApacheWEB13(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getApacheState(tasks).config;
  // `.ht*`(.htaccess/.htpasswd) 노출 차단 블록 존재 여부.
  const protectsHt = /<Files(Match)?\s+[~*]?\s*["']?\^?\\?\.ht/i.test(config) && /Require\s+all\s+denied|Deny\s+from\s+all/i.test(config);
  return { id: "WEB-13", status: protectsHt ? "pass" : "fail", evidence: protectsHt ? "설정 파일(.ht*) 접근 차단(<Files ~ ^\\.ht> Require all denied)이 설정됨" : "설정 파일(.ht*) 노출 차단 블록이 확인되지 않음" };
}

export function evaluateApacheWEB14(tasks: AnsibleTaskOutput[]): CheckResult {
  const lines = activeLines(getApacheState(tasks).config);
  // 임의 <Directory> 블록 중 하나라도 `Require all granted`가 있고 기본 거부가 없으면 취약,
  // 명시적 default-deny가 하나 이상 존재하면 양호로 본다(보수적).
  const hasDeny = lines.some((l) => /^Require\s+all\s+denied/i.test(l) || /^Deny\s+from\s+all/i.test(l));
  const hasOpenGrant = lines.some((l) => /^Require\s+all\s+granted/i.test(l));
  const ok = hasDeny || !hasOpenGrant;
  return { id: "WEB-14", status: ok ? "pass" : "fail", evidence: ok ? "디렉터리 기본 접근통제(Require all denied)가 존재하거나 전체 허용이 없음" : "명시적 기본 거부 없이 Require all granted만 존재(접근통제 미흡)" };
}

export function evaluateApacheWEB15(): CheckResult {
  return { id: "WEB-15", status: "review", evidence: "불필요한 스크립트 핸들러/매핑 제거 여부는 서비스 요건 판단 필요 — 수동 확인" };
}

export function evaluateApacheWEB16(tasks: AnsibleTaskOutput[]): CheckResult {
  const lines = activeLines(getApacheState(tasks).config);
  const tokensOk = lines.some((l) => /^ServerTokens\s+(Prod|ProductOnly)/i.test(l));
  const sigOff = lines.some((l) => /^ServerSignature\s+Off/i.test(l));
  const ok = tokensOk && sigOff;
  return { id: "WEB-16", status: ok ? "pass" : "fail", evidence: ok ? "ServerTokens Prod + ServerSignature Off로 헤더 정보 노출이 제한됨" : `헤더 정보 노출 제한 미흡 (ServerTokens Prod: ${tokensOk}, ServerSignature Off: ${sigOff})` };
}

export function evaluateApacheWEB17(): CheckResult {
  return { id: "WEB-17", status: "review", evidence: "불필요한 가상 디렉터리(Alias) 삭제 여부는 서비스 요건 판단 필요 — 수동 확인" };
}

export function evaluateApacheWEB18(tasks: AnsibleTaskOutput[]): CheckResult {
  const { modules } = getApacheState(tasks);
  const dav = moduleLoaded(modules, "dav_module") || moduleLoaded(modules, "dav_fs_module");
  return { id: "WEB-18", status: dav ? "fail" : "pass", evidence: dav ? "WebDAV 모듈(mod_dav)이 로드되어 있음 — 불필요 시 비활성화 필요" : "WebDAV 모듈이 로드되어 있지 않음" };
}
