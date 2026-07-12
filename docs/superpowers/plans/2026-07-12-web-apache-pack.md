# WEB — Apache 벤더 팩 (#1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KISA 웹 서비스 기준(WEB-01~26)을 Apache로 평가하는 `web-apache` 벤더 팩을 추가한다.

**Architecture:** 확정된 `VendorPack` 계약에 순수 추가로 붙는다. `src/lib/packs/webApache.ts`가 Apache 고유 증거 태스크(`PlaybookTask[]`), `getApacheState` 헬퍼, 26개 평가기, 그리고 pack 객체를 정의하고, `registry.ts`의 `ALL_PACKS`에 등록된다. 미탐지 처리는 엔진(`evaluatePack`)이 담당하므로 평가기는 Apache 존재를 전제한다. 새 카탈로그 항목은 없다(WEB-01~26 재사용).

**Tech Stack:** TypeScript, better-sqlite3, vitest, Ansible(raw over docker/ssh).

## Global Constraints

- Node 24로 테스트: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 `npx vitest run`.
- 게이트(커밋 전): `npx tsc --noEmit` && `npx eslint <touched>` && 관련 vitest 통과.
- 순수 추가: 선택 엔진(`resolve.ts`)·오케스트레이터·serverScan·nginx 팩·카탈로그 데이터는 수정하지 않는다. 유일한 기존 파일 수정은 `registry.ts`의 `ALL_PACKS`에 한 줄 추가.
- 자동판정 분류는 스펙 표를 따른다: 설정·모듈로 명확한 항목만 pass/fail, 계정·비밀번호·버전·외부연동 등은 review.
- 각 결과 `source`는 기존 WEB 카탈로그 항목의 값(`KISA · 웹 서비스 WEB-XX`)을 그대로 쓴다(평가기는 status/evidence만 만들고, frameworkId/source는 store/decorate가 카탈로그에서 채움 — #0에서 배선됨).
- 평가기는 `AnsibleTaskOutput` 배열만 입력받는 순수 함수. 증거 태스크 `name`은 팩 내 유일.

---

## File Structure

- Create: `src/lib/packs/webApache.ts` — 증거 태스크, `getApacheState`/헬퍼, WEB-01~26 평가기, `webApachePack`.
- Create: `src/lib/packs/webApache.test.ts` — 평가기 단위 테스트 + 팩 형태 테스트.
- Modify: `src/lib/packs/registry.ts` — `ALL_PACKS`에 `webApachePack` 추가.
- Modify: `src/lib/packs/registry.test.ts` / `resolve.test.ts` — Apache 선택 케이스 추가.

`AnsibleTaskOutput` 형태(참고): `{ taskName: string; stdout: string }`.

---

## Task 1: Apache 증거 태스크 + 상태 헬퍼

**Files:** Create `src/lib/packs/webApache.ts`(부분), Test `src/lib/packs/webApache.test.ts`(부분)

**Interfaces:**
- Produces:
  - `APACHE_EVIDENCE: PlaybookTask[]` (7개 태스크).
  - `getApacheState(tasks): { present: boolean; config: string; modules: string[] }`.
  - `activeLines(config): string[]` (주석·빈 줄 제거), `moduleLoaded(modules, name): boolean`.
  - `getApacheDocRootScan(tasks): { leftovers: string[]; writable: string[]; missing: boolean }`.

- [ ] **Step 1: 실패 테스트** — `webApache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { APACHE_EVIDENCE, getApacheState, moduleLoaded, activeLines } from "./webApache";

const present = [
  { taskName: "apache detection (internal)", stdout: "present\n" },
  { taskName: "apache modules (internal)", stdout: " core_module (static)\n dav_module (shared)\n ssl_module (shared)\n" },
  { taskName: "apache effective config (internal)", stdout: "ServerTokens Prod\n# a comment\n\nServerSignature Off\n" },
];

describe("apache evidence + state", () => {
  it("declares the 7 apache evidence tasks with unique names", () => {
    const names = APACHE_EVIDENCE.map((t) => t.name);
    expect(names).toContain("apache detection (internal)");
    expect(names).toContain("apache modules (internal)");
    expect(names).toContain("apache effective config (internal)");
    expect(new Set(names).size).toBe(names.length);
    expect(APACHE_EVIDENCE.length).toBe(7);
  });
  it("parses present/config/modules", () => {
    const s = getApacheState(present);
    expect(s.present).toBe(true);
    expect(s.modules).toEqual(expect.arrayContaining(["core_module", "dav_module", "ssl_module"]));
    expect(moduleLoaded(s.modules, "ssl_module")).toBe(true);
    expect(moduleLoaded(s.modules, "proxy_module")).toBe(false);
  });
  it("absent detection → present false", () => {
    expect(getApacheState([{ taskName: "apache detection (internal)", stdout: "absent" }]).present).toBe(false);
  });
  it("activeLines strips comments and blanks", () => {
    expect(activeLines("ServerTokens Prod\n# c\n\nServerSignature Off")).toEqual(["ServerTokens Prod", "ServerSignature Off"]);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/packs/webApache.test.ts` → FAIL (모듈 없음).

- [ ] **Step 3: 구현** — `src/lib/packs/webApache.ts` 상단:

```ts
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";

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

// 로그/권한 stat 공용: "%U:%G %a" 문자열에서 group/other 쓰기 비트가 없으면 양호.
export function statNoGroupOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return (g & 2) === 0 && (o & 2) === 0;
}
```

  주의: TS 문자열의 백슬래시 이스케이프(`\\$2`, `\\(`, `\\"`)를 정확히 넣는다. 이 태스크들은 실제 ansible에서 실행되므로 셸 문법이 유효해야 한다.

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/packs/webApache.test.ts` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/webApache.ts src/lib/packs/webApache.test.ts
git commit -m "feat: web-apache 증거 태스크 + 상태 헬퍼 (#web-apache)"
```

---

## Task 2: 계정관리 평가기 (WEB-01, 02, 03)

**Files:** Modify `src/lib/packs/webApache.ts`, `src/lib/packs/webApache.test.ts`

**Interfaces:**
- Consumes: `getApacheState`, `activeLines`, `statNoGroupOtherWrite`, `findExact`(내부).
- Produces: `evaluateApacheWEB01/02/03(tasks): CheckResult`. `CheckResult` from `@/lib/checks/types`.

- [ ] **Step 1: 실패 테스트** — `webApache.test.ts`에 추가:

```ts
import { evaluateApacheWEB01, evaluateApacheWEB02, evaluateApacheWEB03 } from "./webApache";

const withAuth = [
  { taskName: "apache detection (internal)", stdout: "present" },
  { taskName: "apache effective config (internal)", stdout: 'AuthType Basic\nAuthName "x"\nAuthUserFile /etc/apache2/.htpasswd' },
];
it("WEB-01/02 → review when basic auth is configured", () => {
  expect(evaluateApacheWEB01(withAuth).status).toBe("review");
  expect(evaluateApacheWEB02(withAuth).status).toBe("review");
});
it("WEB-01/02 → skip when no auth configured", () => {
  const noAuth = [{ taskName: "apache detection (internal)", stdout: "present" }, { taskName: "apache effective config (internal)", stdout: "ServerTokens Prod" }];
  expect(evaluateApacheWEB01(noAuth).status).toBe("skip");
});
it("WEB-03 pass/fail on AuthUserFile perms; skip when missing", () => {
  const ok = [{ taskName: "WEB-03: apache auth password file permissions", stdout: "root:root 600" }];
  const bad = [{ taskName: "WEB-03: apache auth password file permissions", stdout: "root:root 644" }];
  const none = [{ taskName: "WEB-03: apache auth password file permissions", stdout: "__MISSING__" }];
  expect(evaluateApacheWEB03(ok).status).toBe("pass");
  expect(evaluateApacheWEB03(bad).status).toBe("fail");
  expect(evaluateApacheWEB03(none).status).toBe("skip");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `webApache.ts`에 추가:

```ts
import type { CheckResult } from "@/lib/checks/types";

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
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/webApache.ts src/lib/packs/webApache.test.ts
git commit -m "feat: web-apache 계정관리 평가기 WEB-01~03 (#web-apache)"
```

---

## Task 3: 서비스관리 평가기 A (WEB-04, 05, 06, 07, 08, 09, 10, 11, 12)

**Files:** Modify `src/lib/packs/webApache.ts`, `src/lib/packs/webApache.test.ts`

**Interfaces:**
- Produces: `evaluateApacheWEB04/05/06/07/08/09/10/11/12(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — `webApache.test.ts`에 추가:

```ts
import {
  evaluateApacheWEB04, evaluateApacheWEB05, evaluateApacheWEB06, evaluateApacheWEB07,
  evaluateApacheWEB08, evaluateApacheWEB09, evaluateApacheWEB10, evaluateApacheWEB11, evaluateApacheWEB12,
} from "./webApache";

const cfg = (config: string, extra: AnsibleTaskOutput[] = []) => [
  { taskName: "apache detection (internal)", stdout: "present" },
  { taskName: "apache effective config (internal)", stdout: config },
  ...extra,
];
const mods = (list: string) => ({ taskName: "apache modules (internal)", stdout: list });

it("WEB-04 listing: Indexes on → fail, off → pass", () => {
  expect(evaluateApacheWEB04([...cfg("Options Indexes FollowSymLinks"), mods(" autoindex_module (shared)")]).status).toBe("fail");
  expect(evaluateApacheWEB04([...cfg("Options -Indexes"), mods(" core_module (static)")]).status).toBe("pass");
});
it("WEB-05 → review", () => { expect(evaluateApacheWEB05(cfg("")).status).toBe("review"); });
it("WEB-09 User root → fail, non-root → pass, absent → skip", () => {
  expect(evaluateApacheWEB09(cfg("User www-data\nGroup www-data")).status).toBe("pass");
  expect(evaluateApacheWEB09(cfg("User root")).status).toBe("fail");
  expect(evaluateApacheWEB09(cfg("ServerTokens Prod")).status).toBe("skip");
});
it("WEB-10 proxy loaded → fail, not → pass", () => {
  expect(evaluateApacheWEB10([...cfg(""), mods(" proxy_module (shared)")]).status).toBe("fail");
  expect(evaluateApacheWEB10([...cfg(""), mods(" core_module (static)")]).status).toBe("pass");
});
it("WEB-12 FollowSymLinks without owner-match → fail", () => {
  expect(evaluateApacheWEB12(cfg("Options FollowSymLinks")).status).toBe("fail");
  expect(evaluateApacheWEB12(cfg("Options SymLinksIfOwnerMatch")).status).toBe("pass");
});
it("WEB-07 leftovers → fail, clean → pass, missing → skip", () => {
  expect(evaluateApacheWEB07([...cfg(""), { taskName: "apache document root scan (internal)", stdout: "LEFTOVER:/var/www/html/phpinfo.php" }]).status).toBe("fail");
  expect(evaluateApacheWEB07([...cfg(""), { taskName: "apache document root scan (internal)", stdout: "__MISSING__" }]).status).toBe("skip");
});
it("WEB-08/11 → review", () => {
  expect(evaluateApacheWEB08(cfg("")).status).toBe("review");
  expect(evaluateApacheWEB11(cfg("")).status).toBe("review");
});
it("WEB-06 root Directory deny → pass, missing → fail", () => {
  expect(evaluateApacheWEB06(cfg("<Directory />\n  Require all denied\n</Directory>")).status).toBe("pass");
  expect(evaluateApacheWEB06(cfg("ServerTokens Prod")).status).toBe("fail");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `webApache.ts`에 추가:

```ts
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
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/webApache.ts src/lib/packs/webApache.test.ts
git commit -m "feat: web-apache 서비스관리 평가기 WEB-04~12 (#web-apache)"
```

---

## Task 4: 서비스관리 평가기 B (WEB-13, 14, 15, 16, 17, 18)

**Files:** Modify `src/lib/packs/webApache.ts`, `src/lib/packs/webApache.test.ts`

**Interfaces:**
- Produces: `evaluateApacheWEB13/14/15/16/17/18(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateApacheWEB13, evaluateApacheWEB14, evaluateApacheWEB15, evaluateApacheWEB16, evaluateApacheWEB17, evaluateApacheWEB18 } from "./webApache";

it("WEB-13 .ht protection present → pass, absent → fail", () => {
  expect(evaluateApacheWEB13(cfg('<Files ~ "^\\.ht">\n  Require all denied\n</Files>')).status).toBe("pass");
  expect(evaluateApacheWEB13(cfg("ServerTokens Prod")).status).toBe("fail");
});
it("WEB-14 docroot Directory default-deny → pass else fail", () => {
  expect(evaluateApacheWEB14(cfg("<Directory /var/www/>\n  Require all denied\n</Directory>")).status).toBe("pass");
  expect(evaluateApacheWEB14(cfg("<Directory /var/www/>\n  Require all granted\n</Directory>")).status).toBe("fail");
});
it("WEB-15/17 → review", () => {
  expect(evaluateApacheWEB15(cfg("")).status).toBe("review");
  expect(evaluateApacheWEB17(cfg("")).status).toBe("review");
});
it("WEB-16 ServerTokens Prod + ServerSignature Off → pass", () => {
  expect(evaluateApacheWEB16(cfg("ServerTokens Prod\nServerSignature Off")).status).toBe("pass");
  expect(evaluateApacheWEB16(cfg("ServerTokens Full\nServerSignature On")).status).toBe("fail");
});
it("WEB-18 dav loaded → fail, not → pass", () => {
  expect(evaluateApacheWEB18([...cfg(""), mods(" dav_module (shared)\n dav_fs_module (shared)")]).status).toBe("fail");
  expect(evaluateApacheWEB18([...cfg(""), mods(" core_module (static)")]).status).toBe("pass");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가:

```ts
export function evaluateApacheWEB13(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getApacheState(tasks).config;
  // `.ht*`(.htaccess/.htpasswd) 노출 차단 블록 존재 여부.
  const protectsHt = /<Files(Match)?\s+[~"']?\s*\^?\\?\.ht/i.test(config) && /Require\s+all\s+denied|Deny\s+from\s+all/i.test(config);
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
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/webApache.ts src/lib/packs/webApache.test.ts
git commit -m "feat: web-apache 서비스관리 평가기 WEB-13~18 (#web-apache)"
```

---

## Task 5: 보안설정·패치로그 평가기 (WEB-19~26)

**Files:** Modify `src/lib/packs/webApache.ts`, `src/lib/packs/webApache.test.ts`

**Interfaces:**
- Produces: `evaluateApacheWEB19/20/21/22/23/24/25/26(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateApacheWEB19, evaluateApacheWEB20, evaluateApacheWEB21, evaluateApacheWEB22, evaluateApacheWEB23, evaluateApacheWEB24, evaluateApacheWEB25, evaluateApacheWEB26 } from "./webApache";

it("WEB-19 SSI: mod_include loaded → fail, not → pass", () => {
  expect(evaluateApacheWEB19([...cfg(""), mods(" include_module (shared)")]).status).toBe("fail");
  expect(evaluateApacheWEB19([...cfg(""), mods(" core_module (static)")]).status).toBe("pass");
});
it("WEB-20 SSL: mod_ssl + SSLEngine on → pass else fail", () => {
  expect(evaluateApacheWEB20([...cfg("SSLEngine on"), mods(" ssl_module (shared)")]).status).toBe("pass");
  expect(evaluateApacheWEB20([...cfg(""), mods(" core_module (static)")]).status).toBe("fail");
});
it("WEB-21 http→https redirect present → pass else fail", () => {
  expect(evaluateApacheWEB21(cfg("RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301]")).status).toBe("pass");
  expect(evaluateApacheWEB21(cfg("ServerTokens Prod")).status).toBe("fail");
});
it("WEB-22/23/24 → review", () => {
  expect(evaluateApacheWEB22(cfg("")).status).toBe("review");
  expect(evaluateApacheWEB23(cfg("")).status).toBe("review");
  expect(evaluateApacheWEB24(cfg("")).status).toBe("review");
});
it("WEB-25 → review with version evidence", () => {
  const r = evaluateApacheWEB25([{ taskName: "apache version (internal)", stdout: "Server version: Apache/2.4.58 (Ubuntu)" }]);
  expect(r.status).toBe("review");
  expect(r.evidence).toContain("2.4.58");
});
it("WEB-26 log dir perms pass/fail; missing → skip", () => {
  expect(evaluateApacheWEB26([{ taskName: "WEB-26: apache log directory permissions", stdout: "root:adm 750" }]).status).toBe("pass");
  expect(evaluateApacheWEB26([{ taskName: "WEB-26: apache log directory permissions", stdout: "root:root 777" }]).status).toBe("fail");
  expect(evaluateApacheWEB26([{ taskName: "WEB-26: apache log directory permissions", stdout: "__MISSING__" }]).status).toBe("skip");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가:

```ts
export function evaluateApacheWEB19(tasks: AnsibleTaskOutput[]): CheckResult {
  const { config, modules } = getApacheState(tasks);
  const includesOn = moduleLoaded(modules, "include_module") || activeLines(config).some((l) => /^Options\b/i.test(l) && /(^|\s)\+?Includes\b/i.test(l) && !/-Includes\b/i.test(l));
  return { id: "WEB-19", status: includesOn ? "fail" : "pass", evidence: includesOn ? "SSI(mod_include/Options Includes)가 활성화되어 있음 — 불필요 시 비활성화 필요" : "SSI가 비활성(mod_include 미로드 및 Includes 미사용)" };
}

export function evaluateApacheWEB20(tasks: AnsibleTaskOutput[]): CheckResult {
  const { config, modules } = getApacheState(tasks);
  const on = moduleLoaded(modules, "ssl_module") && activeLines(config).some((l) => /^SSLEngine\s+on/i.test(l));
  return { id: "WEB-20", status: on ? "pass" : "fail", evidence: on ? "SSL/TLS가 활성화됨(mod_ssl + SSLEngine on)" : "SSL/TLS 활성화가 확인되지 않음(mod_ssl 미로드 또는 SSLEngine on 없음)" };
}

export function evaluateApacheWEB21(tasks: AnsibleTaskOutput[]): CheckResult {
  const config = getApacheState(tasks).config;
  const redirects = /Redirect\s+.*https:\/\//i.test(config) || /RewriteRule\s+.*https:\/\//i.test(config);
  return { id: "WEB-21", status: redirects ? "pass" : "fail", evidence: redirects ? "HTTP→HTTPS 리디렉션 설정이 확인됨" : "HTTP→HTTPS 리디렉션 설정이 확인되지 않음" };
}

export function evaluateApacheWEB22(): CheckResult {
  return { id: "WEB-22", status: "review", evidence: "커스텀 에러 페이지(ErrorDocument) 정책 적정성은 판단 필요 — 수동 확인" };
}
export function evaluateApacheWEB23(): CheckResult {
  return { id: "WEB-23", status: "review", evidence: "LDAP 연동 알고리즘 구성은 외부 시스템 맥락 판단 필요 — 수동 확인" };
}
export function evaluateApacheWEB24(): CheckResult {
  return { id: "WEB-24", status: "review", evidence: "별도 업로드 경로/권한 설정은 조직 정책 판단 필요 — 수동 확인" };
}

export function evaluateApacheWEB25(tasks: AnsibleTaskOutput[]): CheckResult {
  const ver = tasks.find((t) => t.taskName === "apache version (internal)")?.stdout.trim() ?? "확인 불가";
  return { id: "WEB-25", status: "review", evidence: `Apache 버전: ${ver} — 정적 점검만으로는 최신 보안 패치 적용 여부를 판단할 수 없어 벤더 권고사항과 수동 대조 필요` };
}

export function evaluateApacheWEB26(tasks: AnsibleTaskOutput[]): CheckResult {
  const stat = tasks.find((t) => t.taskName === "WEB-26: apache log directory permissions")?.stdout.trim() ?? "";
  if (!stat || stat === "__MISSING__") return { id: "WEB-26", status: "skip", evidence: "로그 디렉터리를 확인할 수 없음" };
  const ok = statNoGroupOtherWrite(stat);
  return { id: "WEB-26", status: ok ? "pass" : "fail", evidence: `로그 디렉터리 권한: ${stat}` };
}
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/webApache.ts src/lib/packs/webApache.test.ts
git commit -m "feat: web-apache 보안설정·패치로그 평가기 WEB-19~26 (#web-apache)"
```

---

## Task 6: 팩 조립 + 레지스트리 등록

**Files:** Modify `src/lib/packs/webApache.ts`, `src/lib/packs/registry.ts`, `src/lib/packs/registry.test.ts`, `src/lib/packs/resolve.test.ts`, Test `src/lib/packs/webApache.test.ts`

**Interfaces:**
- Consumes: 모든 `evaluateApacheWEB01..26`, `getApacheState`, `APACHE_EVIDENCE`, `getCatalogByCategory`.
- Produces: `webApachePack: VendorPack` (export). `ALL_PACKS`에 등록.

- [ ] **Step 1: 실패 테스트** — `webApache.test.ts`에 추가 + registry/resolve 테스트 갱신:

```ts
import { webApachePack } from "./webApache";
import { getCatalogByCategory } from "@/lib/catalog";

it("webApachePack shape + evaluate returns one result per web item", () => {
  const webIds = getCatalogByCategory("web").map((i) => i.id).sort();
  expect(webApachePack.id).toBe("web-apache");
  expect(webApachePack.vendors).toEqual(["Apache"]);
  expect(webApachePack.itemIds.slice().sort()).toEqual(webIds);
  const present = [
    { taskName: "apache detection (internal)", stdout: "present" },
    { taskName: "apache modules (internal)", stdout: " core_module (static)" },
    { taskName: "apache effective config (internal)", stdout: "ServerTokens Prod\nServerSignature Off" },
  ];
  const results = webApachePack.evaluate({ findings: null, tasks: present });
  expect(results.map((r) => r.id).sort()).toEqual(webIds);
  expect(webApachePack.detect(present)).toBe(true);
  expect(webApachePack.detect([])).toBe(false);
});
```

  `src/lib/packs/registry.test.ts`의 `ALL_PACKS` 단언을 갱신:
```ts
expect(ALL_PACKS.map((p) => p.id).sort()).toEqual(["container", "os-unix", "web-apache", "web-nginx"]);
```
  그리고 findVendorPack Apache 케이스 추가:
```ts
expect(findVendorPack("WEB", "Apache")?.id).toBe("web-apache");
expect(findVendorPack("WEB", "apache")?.id).toBe("web-apache");
```
  `src/lib/packs/resolve.test.ts`에 추가:
```ts
it("server + WEB/Apache → os-unix + web-apache with apache evidence", () => {
  const asset = { ...base, type: "server", category: "WEB", vendor: "Apache" } as Asset;
  const plan = resolveCheckPlan(asset);
  expect(plan.packs.map((p) => p.id)).toEqual(["os-unix", "web-apache"]);
  expect(plan.evidenceTasks.some((t) => t.name === "apache detection (internal)")).toBe(true);
});
```

- [ ] **Step 2: 실패 확인** — FAIL (webApachePack 미정의, ALL_PACKS 미포함).

- [ ] **Step 3: 구현** — `webApache.ts` 하단에 팩 객체 추가:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import type { EvalContext, VendorPack } from "./types";

function evaluateApache(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    evaluateApacheWEB01(t), evaluateApacheWEB02(t), evaluateApacheWEB03(t), evaluateApacheWEB04(t), evaluateApacheWEB05(),
    evaluateApacheWEB06(t), evaluateApacheWEB07(t), evaluateApacheWEB08(), evaluateApacheWEB09(t), evaluateApacheWEB10(t),
    evaluateApacheWEB11(), evaluateApacheWEB12(t), evaluateApacheWEB13(t), evaluateApacheWEB14(t), evaluateApacheWEB15(),
    evaluateApacheWEB16(t), evaluateApacheWEB17(), evaluateApacheWEB18(t), evaluateApacheWEB19(t), evaluateApacheWEB20(t),
    evaluateApacheWEB21(t), evaluateApacheWEB22(), evaluateApacheWEB23(), evaluateApacheWEB24(), evaluateApacheWEB25(t),
    evaluateApacheWEB26(t),
  ];
}

export const webApachePack: VendorPack = {
  id: "web-apache",
  category: "WEB",
  vendors: ["Apache"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("web").map((i) => i.id),
  evidenceTasks: APACHE_EVIDENCE,
  detect: (tasks) => getApacheState(tasks).present,
  evaluate: evaluateApache,
};
```

  `src/lib/packs/registry.ts`:
```ts
import { webApachePack } from "./webApache";
export const ALL_PACKS: VendorPack[] = [osUnixPack, containerPack, webNginxPack, webApachePack];
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/packs` → PASS (registry/resolve/webApache 전부).

- [ ] **Step 5: 전체 스위트** — `npx vitest run` → 기존 그린 수 + 신규. 회귀 없음 확인.

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/packs/webApache.ts src/lib/packs/registry.ts
git add src/lib/packs/webApache.ts src/lib/packs/registry.ts src/lib/packs/registry.test.ts src/lib/packs/resolve.test.ts src/lib/packs/webApache.test.ts
git commit -m "feat: web-apache 팩 조립 + 레지스트리 등록 (#web-apache)"
```

---

## Task 7: 실제 흐름 검증 (Docker apache2 E2E)

**Files:** (코드 변경 없음 — 검증. 발견된 버그만 최소 수정 후 별도 커밋.)

- [ ] **Step 1: 전체 단위 테스트 그린** — `npx vitest run` PASS.

- [ ] **Step 2: apache2 테스트 대상 준비** — 기존 nhg-test 컨테이너 중 하나(WEB/Apache 자산으로 등록할 것)에 apache2 설치:
```bash
docker exec <container> sh -c 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq apache2 && service apache2 start && apache2ctl -v'
```
  DB에 `category=WEB, vendor=Apache`인 서버 자산이 없으면 앱에서 하나 등록(해당 컨테이너 SSH 접속정보). 기존에 `테스트-WAS-Tomcat`(2233) 등이 있으므로, 새 Apache 자산을 등록하거나 빈 컨테이너를 재활용한다.

- [ ] **Step 3: positive 검증** — 실제 프로덕션 경로로 점검 실행(앱 API 또는 tsx로 `resolveCheckPlan`→`runAnsibleForServer(asset, plan.evidenceTasks)`→`evaluatePlan`). 기대:
  - packs = `os-unix, web-apache`, apache 증거 태스크 합성됨.
  - U-* 베이스라인 + WEB-*가 정상 pass/fail/review(전부 review 아님).
  - 모듈 기반 항목(WEB-18 WebDAV, WEB-20 SSL 등)이 설치 상태에 맞게 판정됨.

- [ ] **Step 4: negative 검증** — apache 없는 컨테이너를 `WEB/Apache`로 점검 → WEB-* 전부 `review`("선언된 Apache 미확인").

- [ ] **Step 5: OS 베이스라인 병존** — WEB/Apache 결과에 U-* 항목이 함께 존재.

- [ ] **Step 6: 정리 + 최종 게이트** — 테스트 흔적 정리, `npx tsc --noEmit && npx eslint <touched> && npx vitest run` 그린 확인.

---

## Self-Review (완료)

- **스펙 커버리지:** 증거 수집(T1), WEB-01~26 판정 표 전 항목(T2~T5, 스펙 표의 pass/fail vs review 분류와 일치), 팩 조립·등록(T6), E2E(T7) 모두 태스크 존재.
- **플레이스홀더:** 각 평가기·테스트 완전 코드 포함. TBD 없음.
- **타입 일관성:** `getApacheState`/`moduleLoaded`/`activeLines`/`statNoGroupOtherWrite`/`getApacheDocRootScan`, `evaluateApacheWEB01..26(tasks)`, `webApachePack`(VendorPack) 시그니처가 태스크 전반 일치. 인자 없는 review-전용 평가기(WEB-05/08/11/15/17/22/23/24)는 `evaluate`에서 `()`로 호출(T6와 일치).
- **주의:** WEB-06/13/14/21은 설정 휴리스틱이라 오탐 여지가 있어 조건을 보수적으로(default-deny/명시 리디렉션 탐지) 구현했다. E2E(T7)와 최종 리뷰에서 실제 apache2 기본 설정 대비 타당성을 확인한다.
