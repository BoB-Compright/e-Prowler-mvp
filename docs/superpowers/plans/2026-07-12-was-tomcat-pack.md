# WAS — Tomcat 벤더 팩 (#2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CIS Apache Tomcat Benchmark 기준으로 Tomcat을 점검하는 `was-tomcat` 팩과 WAS(CIS) 카탈로그를 추가한다.

**Architecture:** `VendorPack` 계약에 순수 추가. `src/lib/catalog/data/cis/was.json`(WAS-01~12, CIS 소싱)을 신설·등록하고, `src/lib/packs/wasTomcat.ts`가 Tomcat 증거 태스크·`getTomcatState` 헬퍼·12개 평가기·pack을 정의해 `registry.ts`에 등록한다. 미탐지·review는 엔진(#0)과 AI 판정(#2a)이 처리한다.

**Tech Stack:** TypeScript, better-sqlite3, vitest, Ansible(raw over ssh/docker).

## Global Constraints

- Node 24로 테스트: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 `npx vitest run`.
- 게이트(커밋 전): `npx tsc --noEmit` && `npx eslint <touched>` && 관련 vitest 통과.
- 순수 추가: 선택 엔진/오케스트레이터/serverScan/기존 팩 수정 금지. 기존 파일 수정은 `catalog/index.ts`(CATALOG_SOURCES 1줄)·`registry.ts`(ALL_PACKS 1줄)뿐.
- 출처: CIS 대등 표기(`source:{framework:"CIS", ref}`), 불확실 항목번호는 `(항목 확인 필요)`. KISA 아님 같은 부정 문구 금지.
- review 최소화: 설계상 WAS-12만 본질적 review(버전/패치), WAS-11은 버전인지 pass/fail(≥10 pass, <10은 `-security` 유무로 pass/fail, 불명 시 review). 남는 review는 #2a AI 판정이 흡수(별도 작업 불필요).
- 평가기는 `AnsibleTaskOutput[]`만 받는 순수 함수. 증거 태스크 `name`은 팩 내 유일, `raw` 셸 문법 유효 + `; true`.

---

## File Structure

- Create: `src/lib/catalog/data/cis/was.json` — WAS-01~12 카탈로그 항목.
- Modify: `src/lib/catalog/index.ts` — `import wasData` + `CATALOG_SOURCES`에 was 항목.
- Create: `src/lib/packs/wasTomcat.ts` — 증거·헬퍼·12평가기·`wasTomcatPack`.
- Create: `src/lib/packs/wasTomcat.test.ts`.
- Modify: `src/lib/packs/registry.ts` — `ALL_PACKS`에 `wasTomcatPack`.
- Modify: `src/lib/packs/registry.test.ts`, `resolve.test.ts` — WAS/Tomcat 케이스.

`AnsibleTaskOutput` = `{ taskName: string; stdout: string }`. `CheckResult` = `{ id, status, evidence }`(from `@/lib/checks/types`).

---

## Task 1: WAS 카탈로그(CIS) 신설 + 등록

**Files:** Create `src/lib/catalog/data/cis/was.json`, Modify `src/lib/catalog/index.ts`, Test `src/lib/catalog/index.test.ts`

**Interfaces:**
- Produces: `getCatalogByCategory("was")`가 WAS-01~12 반환, 각 `frameworkId:"cis"`, `source.framework:"CIS"`.

- [ ] **Step 1: 실패 테스트** — `src/lib/catalog/index.test.ts`에 추가:

```ts
it("has 12 CIS-sourced WAS items", () => {
  const was = getCatalogByCategory("was");
  expect(was).toHaveLength(12);
  expect(was.every((i) => i.frameworkId === "cis")).toBe(true);
  expect(was.every((i) => i.source.framework === "CIS")).toBe(true);
  expect(was.map((i) => i.id)).toContain("WAS-01");
  expect(was.map((i) => i.id)).toContain("WAS-12");
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/catalog/index.test.ts` → FAIL.

- [ ] **Step 3: 카탈로그 데이터** — `src/lib/catalog/data/cis/was.json` (12개 항목). 각 항목 형식은 기존 web.json과 동일(`id,title,severity,automationStatus,source`). `appliesTo`는 넣지 않는다(팩이 벤더 스코핑). severity는 CIS 권고 중요도에 맞춰 High/Medium 배분:

```json
[
  { "id": "WAS-01", "title": "기본/샘플 웹 애플리케이션 제거", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Remove default/sample apps (항목 확인 필요)" } },
  { "id": "WAS-02", "title": "Shutdown 포트/명령 하드닝", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Shutdown port/command (항목 확인 필요)" } },
  { "id": "WAS-03", "title": "비특권 전용 계정으로 구동", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Run as non-privileged user (항목 확인 필요)" } },
  { "id": "WAS-04", "title": "conf 디렉터리 접근 권한 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - conf directory permissions (항목 확인 필요)" } },
  { "id": "WAS-05", "title": "기본 관리자 계정/역할 비활성화", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Default manager account (항목 확인 필요)" } },
  { "id": "WAS-06", "title": "AJP 커넥터 비활성화/보안", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - AJP connector (Ghostcat) (항목 확인 필요)" } },
  { "id": "WAS-07", "title": "autoDeploy/deployOnStartup 비활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - autoDeploy/deployOnStartup (항목 확인 필요)" } },
  { "id": "WAS-08", "title": "에러/버전 헤더 정보 노출 제한", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Suppress server info (항목 확인 필요)" } },
  { "id": "WAS-09", "title": "접근 로깅(AccessLogValve) 활성화", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Access logging (항목 확인 필요)" } },
  { "id": "WAS-10", "title": "커넥터 TLS/allowTrace 설정", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Connector allowTrace/TLS (항목 확인 필요)" } },
  { "id": "WAS-11", "title": "SecurityManager 사용", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - SecurityManager (항목 확인 필요)" } },
  { "id": "WAS-12", "title": "주기적 보안 패치 및 버전 관리", "severity": "High", "automationStatus": "automated", "source": { "framework": "CIS", "ref": "Apache Tomcat Benchmark - Patch/version (항목 확인 필요)" } }
]
```

- [ ] **Step 4: 등록** — `src/lib/catalog/index.ts`:
  - 상단 import 추가: `import wasData from "./data/cis/was.json";`
  - `CATALOG_SOURCES` 배열에 추가: `{ frameworkId: "cis", category: "was", data: wasData as RawItem[] },`

- [ ] **Step 5: 통과 확인** — `npx vitest run src/lib/catalog` → PASS.

- [ ] **Step 6: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/catalog/data/cis/was.json src/lib/catalog/index.ts src/lib/catalog/index.test.ts
git commit -m "feat: WAS(CIS Tomcat) 카탈로그 12항목 신설 + 등록 (#was-tomcat)"
```

---

## Task 2: Tomcat 증거 태스크 + 상태 헬퍼

**Files:** Create `src/lib/packs/wasTomcat.ts`(부분), Test `src/lib/packs/wasTomcat.test.ts`(부분)

**Interfaces:**
- Produces: `TOMCAT_EVIDENCE: PlaybookTask[]`(8개); `getTomcatState(tasks): { present, serverXml, usersXml, webXml, webapps: string[], confPerms, processLine, version }`; `activeLines(xml)`(주석 제거) 로컬 헬퍼; `noGroupOtherWrite(statLine)` 로컬 헬퍼.

- [ ] **Step 1: 실패 테스트** — `src/lib/packs/wasTomcat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TOMCAT_EVIDENCE, getTomcatState, noGroupOtherWrite } from "./wasTomcat";

const present = [
  { taskName: "tomcat detection (internal)", stdout: "present:/opt/tomcat\n" },
  { taskName: "tomcat webapps listing", stdout: "ROOT\nmanager\nexamples\n" },
  { taskName: "tomcat server.xml", stdout: '<Server port="8005" shutdown="SHUTDOWN">' },
];

describe("tomcat evidence + state", () => {
  it("declares 8 unique evidence tasks", () => {
    const names = TOMCAT_EVIDENCE.map((t) => t.name);
    expect(names).toContain("tomcat detection (internal)");
    expect(names).toContain("tomcat server.xml");
    expect(new Set(names).size).toBe(names.length);
    expect(TOMCAT_EVIDENCE.length).toBe(8);
  });
  it("parses present + webapps list", () => {
    const s = getTomcatState(present);
    expect(s.present).toBe(true);
    expect(s.webapps).toEqual(["ROOT", "manager", "examples"]);
    expect(s.serverXml).toContain("SHUTDOWN");
  });
  it("absent detection", () => {
    expect(getTomcatState([{ taskName: "tomcat detection (internal)", stdout: "absent" }]).present).toBe(false);
  });
  it("noGroupOtherWrite: 750 ok, 777 fail", () => {
    expect(noGroupOtherWrite("root:tomcat 750")).toBe(true);
    expect(noGroupOtherWrite("root:root 777")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `src/lib/packs/wasTomcat.ts` 상단:

```ts
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";

const MISSING = "__MISSING__";

// CATALINA_HOME은 detection이 확정하고, 후속 태스크는 동일 후보 경로를 다시 해석해
// conf 파일을 읽는다(nginx/apache 동적 경로 관례). 후보: env + 표준 설치 경로.
const HOME_RESOLVE = `H="${""}"; for c in "$CATALINA_HOME" /opt/tomcat /usr/share/tomcat /usr/share/tomcat9 /usr/share/tomcat10 /opt/apache-tomcat* /var/lib/tomcat9 /var/lib/tomcat10; do if [ -f "$c/conf/server.xml" ]; then H="$c"; break; fi; done`;

export const TOMCAT_EVIDENCE: PlaybookTask[] = [
  { name: "tomcat detection (internal)",
    raw: `sh -c '${HOME_RESOLVE}; if [ -n "$H" ]; then echo "present:$H"; else echo absent; fi; true'` },
  { name: "tomcat server.xml",
    raw: `sh -c '${HOME_RESOLVE}; if [ -n "$H" ] && [ -f "$H/conf/server.xml" ]; then cat "$H/conf/server.xml"; else echo ${MISSING}; fi; true'` },
  { name: "tomcat-users.xml",
    raw: `sh -c '${HOME_RESOLVE}; if [ -n "$H" ] && [ -f "$H/conf/tomcat-users.xml" ]; then cat "$H/conf/tomcat-users.xml"; else echo ${MISSING}; fi; true'` },
  { name: "tomcat web.xml",
    raw: `sh -c '${HOME_RESOLVE}; if [ -n "$H" ] && [ -f "$H/conf/web.xml" ]; then cat "$H/conf/web.xml"; else echo ${MISSING}; fi; true'` },
  { name: "tomcat webapps listing",
    raw: `sh -c '${HOME_RESOLVE}; if [ -n "$H" ] && [ -d "$H/webapps" ]; then ls -1 "$H/webapps"; else echo ${MISSING}; fi; true'` },
  { name: "tomcat conf perms",
    raw: `sh -c '${HOME_RESOLVE}; if [ -n "$H" ] && [ -d "$H/conf" ]; then stat -c "%U:%G %a" "$H/conf"; else echo ${MISSING}; fi; true'` },
  { name: "tomcat process user",
    raw: `sh -c 'ps -eo user,args 2>/dev/null | grep -i "catalina" | grep -v grep | head -1; true'` },
  { name: "tomcat version",
    raw: `sh -c '${HOME_RESOLVE}; if [ -n "$H" ] && [ -f "$H/RELEASE-NOTES" ]; then grep -m1 -iE "Apache Tomcat Version" "$H/RELEASE-NOTES"; elif [ -n "$H" ] && [ -f "$H/bin/version.sh" ]; then CATALINA_HOME="$H" sh "$H/bin/version.sh" 2>/dev/null | grep -m1 "Server version"; else echo ${MISSING}; fi; true'` },
];

function findExact(tasks: AnsibleTaskOutput[], name: string): AnsibleTaskOutput | undefined {
  return tasks.find((t) => t.taskName === name);
}
function raw(tasks: AnsibleTaskOutput[], name: string): string {
  const s = findExact(tasks, name)?.stdout ?? "";
  return s.trim() === MISSING ? "" : s;
}

// XML 주석(<!-- ... -->) 밖의 활성 라인만. 간단히 주석 블록을 제거한 뒤 줄 단위로.
export function activeLines(xml: string): string[] {
  const noComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  return noComments.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function noGroupOtherWrite(statLine: string): boolean {
  const mode = statLine.trim().split(/\s+/).pop() ?? "";
  if (!/^[0-7]{3,4}$/.test(mode)) return false;
  const [g, o] = mode.slice(-2).split("").map(Number);
  return (g & 2) === 0 && (o & 2) === 0;
}

export function getTomcatState(tasks: AnsibleTaskOutput[]): {
  present: boolean; home: string; serverXml: string; usersXml: string; webXml: string;
  webapps: string[]; confPerms: string; processLine: string; version: string;
} {
  const det = findExact(tasks, "tomcat detection (internal)")?.stdout.trim() ?? "";
  const present = det.startsWith("present:");
  const home = present ? det.slice("present:".length) : "";
  const webappsRaw = raw(tasks, "tomcat webapps listing");
  return {
    present, home,
    serverXml: raw(tasks, "tomcat server.xml"),
    usersXml: raw(tasks, "tomcat-users.xml"),
    webXml: raw(tasks, "tomcat web.xml"),
    webapps: webappsRaw ? webappsRaw.split("\n").map((l) => l.trim()).filter(Boolean) : [],
    confPerms: raw(tasks, "tomcat conf perms").trim(),
    processLine: (findExact(tasks, "tomcat process user")?.stdout ?? "").trim(),
    version: (findExact(tasks, "tomcat version")?.stdout ?? "").trim(),
  };
}
```
  주의: `raw` 문자열의 셸 변수(`$H`,`$c`,`$CATALINA_HOME`)는 TS 템플릿에서 `${}`가 아닌 `$`로 유지(TS 보간이 아니라 셸 변수). `${MISSING}`만 TS 보간. `HOME_RESOLVE` 앞부분 `H="${""}"`는 빈 문자열 초기화(TS 보간으로 `H=""` 생성).

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/wasTomcat.ts src/lib/packs/wasTomcat.test.ts
git commit -m "feat: was-tomcat 증거 태스크 + 상태 헬퍼 (#was-tomcat)"
```

---

## Task 3: 평가기 WAS-01~06

**Files:** Modify `src/lib/packs/wasTomcat.ts`, `src/lib/packs/wasTomcat.test.ts`

**Interfaces:**
- Produces: `evaluateWAS01..06(tasks): CheckResult`.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateWAS01, evaluateWAS02, evaluateWAS03, evaluateWAS04, evaluateWAS05, evaluateWAS06 } from "./wasTomcat";

const t = (name: string, stdout: string) => ({ taskName: name, stdout });
const base = (extra: { taskName: string; stdout: string }[]) => [t("tomcat detection (internal)", "present:/opt/tomcat"), ...extra];

it("WAS-01 sample apps present → fail, none → pass", () => {
  expect(evaluateWAS01(base([t("tomcat webapps listing", "ROOT\nmanager\nexamples")])).status).toBe("fail");
  expect(evaluateWAS01(base([t("tomcat webapps listing", "ROOT\nmyapp")])).status).toBe("pass");
});
it("WAS-02 shutdown -1 or non-default → pass, default → fail", () => {
  expect(evaluateWAS02(base([t("tomcat server.xml", '<Server port="-1" shutdown="SHUTDOWN">')])).status).toBe("pass");
  expect(evaluateWAS02(base([t("tomcat server.xml", '<Server port="8005" shutdown="XYZ">')])).status).toBe("pass");
  expect(evaluateWAS02(base([t("tomcat server.xml", '<Server port="8005" shutdown="SHUTDOWN">')])).status).toBe("fail");
});
it("WAS-03 non-root user → pass, root → fail", () => {
  expect(evaluateWAS03(base([t("tomcat process user", "tomcat   /usr/bin/java ... org.apache.catalina.startup.Bootstrap")])).status).toBe("pass");
  expect(evaluateWAS03(base([t("tomcat process user", "root   /usr/bin/java ... catalina")])).status).toBe("fail");
});
it("WAS-04 conf perms 750 → pass, 777 → fail", () => {
  expect(evaluateWAS04(base([t("tomcat conf perms", "root:tomcat 750")])).status).toBe("pass");
  expect(evaluateWAS04(base([t("tomcat conf perms", "root:root 777")])).status).toBe("fail");
});
it("WAS-05 active manager role/user → fail, all commented → pass", () => {
  expect(evaluateWAS05(base([t("tomcat-users.xml", '<tomcat-users><user username="admin" password="s3cret" roles="manager-gui"/></tomcat-users>')])).status).toBe("fail");
  expect(evaluateWAS05(base([t("tomcat-users.xml", "<tomcat-users>\n<!-- <user username=\"admin\" .../> -->\n</tomcat-users>")])).status).toBe("pass");
});
it("WAS-06 active AJP connector → fail, none → pass", () => {
  expect(evaluateWAS06(base([t("tomcat server.xml", '<Connector protocol="AJP/1.3" port="8009" />')])).status).toBe("fail");
  expect(evaluateWAS06(base([t("tomcat server.xml", '<Connector protocol="HTTP/1.1" port="8080" />')])).status).toBe("pass");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가(`import type { CheckResult } from "@/lib/checks/types";` 상단에):

```ts
const SAMPLE_APPS = ["manager", "host-manager", "examples", "docs"];

export function evaluateWAS01(tasks: AnsibleTaskOutput[]): CheckResult {
  const { webapps } = getTomcatState(tasks);
  const found = webapps.filter((w) => SAMPLE_APPS.includes(w.toLowerCase()));
  return { id: "WAS-01", status: found.length ? "fail" : "pass", evidence: found.length ? `기본/샘플 앱 잔존: ${found.join(", ")}` : "기본/샘플 웹 애플리케이션이 발견되지 않음" };
}

export function evaluateWAS02(tasks: AnsibleTaskOutput[]): CheckResult {
  const xml = getTomcatState(tasks).serverXml;
  const server = activeLines(xml).find((l) => /<Server\b/i.test(l)) ?? "";
  const portNeg1 = /<Server\b[^>]*\bport\s*=\s*"-1"/i.test(server);
  const shutdown = server.match(/shutdown\s*=\s*"([^"]*)"/i)?.[1];
  const hardened = portNeg1 || (shutdown !== undefined && shutdown !== "SHUTDOWN");
  return { id: "WAS-02", status: hardened ? "pass" : "fail", evidence: hardened ? "shutdown 포트/명령이 하드닝됨" : `shutdown 포트/명령이 기본값(port=8005, SHUTDOWN)임: ${server || "확인 불가"}` };
}

export function evaluateWAS03(tasks: AnsibleTaskOutput[]): CheckResult {
  const line = getTomcatState(tasks).processLine;
  if (!line) return { id: "WAS-03", status: "review", evidence: "Tomcat 프로세스를 확인할 수 없어 실행 계정 판정 불가 — 수동/AI 확인" };
  const user = line.split(/\s+/)[0];
  const isRoot = user === "root";
  return { id: "WAS-03", status: isRoot ? "fail" : "pass", evidence: `Tomcat 실행 계정: ${user}` };
}

export function evaluateWAS04(tasks: AnsibleTaskOutput[]): CheckResult {
  const perms = getTomcatState(tasks).confPerms;
  if (!perms) return { id: "WAS-04", status: "skip", evidence: "conf 디렉터리를 확인할 수 없음" };
  const ok = noGroupOtherWrite(perms);
  return { id: "WAS-04", status: ok ? "pass" : "fail", evidence: `conf 디렉터리 권한: ${perms}` };
}

export function evaluateWAS05(tasks: AnsibleTaskOutput[]): CheckResult {
  const xml = getTomcatState(tasks).usersXml;
  const lines = activeLines(xml); // 주석 제거됨
  const hasUser = lines.some((l) => /<user\b/i.test(l));
  const hasPrivRole = lines.some((l) => /<role\b[^>]*rolename\s*=\s*"(manager-gui|admin-gui|manager|admin)"/i.test(l)) || lines.some((l) => /<user\b[^>]*roles\s*=\s*"[^"]*(manager|admin)/i.test(l));
  const fail = hasUser || hasPrivRole;
  return { id: "WAS-05", status: fail ? "fail" : "pass", evidence: fail ? "tomcat-users.xml에 활성 계정/관리 역할이 설정되어 있음" : "활성 사용자/관리 역할이 없음(모두 주석 처리 또는 미설정)" };
}

export function evaluateWAS06(tasks: AnsibleTaskOutput[]): CheckResult {
  const xml = getTomcatState(tasks).serverXml;
  const ajpLines = activeLines(xml).filter((l) => /<Connector\b[^>]*protocol\s*=\s*"AJP/i.test(l));
  if (ajpLines.length === 0) return { id: "WAS-06", status: "pass", evidence: "활성 AJP 커넥터가 없음" };
  const secured = ajpLines.every((l) => /secret\s*=|secretRequired\s*=\s*"true"|address\s*=\s*"(127\.0\.0\.1|::1)"/i.test(l));
  return { id: "WAS-06", status: secured ? "pass" : "fail", evidence: secured ? "AJP 커넥터가 보안 설정(secret/로컬 바인딩)됨" : "AJP 커넥터가 활성화되어 있고 보안 설정이 없음(Ghostcat 위험)" };
}
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/wasTomcat.ts src/lib/packs/wasTomcat.test.ts
git commit -m "feat: was-tomcat 평가기 WAS-01~06 (#was-tomcat)"
```

---

## Task 4: 평가기 WAS-07~12

**Files:** Modify `src/lib/packs/wasTomcat.ts`, `src/lib/packs/wasTomcat.test.ts`

**Interfaces:**
- Produces: `evaluateWAS07..12(tasks): CheckResult`. `parseTomcatMajor(version): number | null` 헬퍼.

- [ ] **Step 1: 실패 테스트** — 추가:

```ts
import { evaluateWAS07, evaluateWAS08, evaluateWAS09, evaluateWAS10, evaluateWAS11, evaluateWAS12 } from "./wasTomcat";

it("WAS-07 autoDeploy true → fail, false → pass", () => {
  expect(evaluateWAS07(base([t("tomcat server.xml", '<Host name="localhost" autoDeploy="true">')])).status).toBe("fail");
  expect(evaluateWAS07(base([t("tomcat server.xml", '<Host name="localhost" autoDeploy="false" deployOnStartup="false">')])).status).toBe("pass");
});
it("WAS-08 xpoweredBy true → fail, server attr set → pass", () => {
  expect(evaluateWAS08(base([t("tomcat server.xml", '<Connector port="8080" xpoweredBy="true" />')])).status).toBe("fail");
  expect(evaluateWAS08(base([t("tomcat server.xml", '<Connector port="8080" server="WebServer" />')])).status).toBe("pass");
});
it("WAS-09 AccessLogValve present → pass, absent → fail", () => {
  expect(evaluateWAS09(base([t("tomcat server.xml", '<Valve className="org.apache.catalina.valves.AccessLogValve" />')])).status).toBe("pass");
  expect(evaluateWAS09(base([t("tomcat server.xml", "<Engine/>")])).status).toBe("fail");
});
it("WAS-10 allowTrace true → fail, absent → pass", () => {
  expect(evaluateWAS10(base([t("tomcat server.xml", '<Connector port="8080" allowTrace="true" />')])).status).toBe("fail");
  expect(evaluateWAS10(base([t("tomcat server.xml", '<Connector port="8080" />')])).status).toBe("pass");
});
it("WAS-11 version>=10 → pass; <10 with -security → pass; <10 without → fail", () => {
  expect(evaluateWAS11(base([t("tomcat version", "Server version: Apache Tomcat/10.1.7")])).status).toBe("pass");
  expect(evaluateWAS11(base([t("tomcat version", "Apache Tomcat Version 9.0.71"), t("tomcat process user", "tomcat java -security org...")])).status).toBe("pass");
  expect(evaluateWAS11(base([t("tomcat version", "Apache Tomcat Version 9.0.71"), t("tomcat process user", "tomcat java org...")])).status).toBe("fail");
});
it("WAS-12 → review with version evidence", () => {
  const r = evaluateWAS12(base([t("tomcat version", "Server version: Apache Tomcat/9.0.71")]));
  expect(r.status).toBe("review");
  expect(r.evidence).toContain("9.0.71");
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 추가:

```ts
export function parseTomcatMajor(version: string): number | null {
  const m = version.match(/(\d+)\.\d+/);
  return m ? Number(m[1]) : null;
}

export function evaluateWAS07(tasks: AnsibleTaskOutput[]): CheckResult {
  const lines = activeLines(getTomcatState(tasks).serverXml);
  const bad = lines.some((l) => /<Host\b/i.test(l) && (/autoDeploy\s*=\s*"true"/i.test(l) || /deployOnStartup\s*=\s*"true"/i.test(l)));
  return { id: "WAS-07", status: bad ? "fail" : "pass", evidence: bad ? "Host에 autoDeploy/deployOnStartup=true가 설정됨" : "autoDeploy/deployOnStartup이 비활성" };
}

export function evaluateWAS08(tasks: AnsibleTaskOutput[]): CheckResult {
  const lines = activeLines(getTomcatState(tasks).serverXml);
  const xpowered = lines.some((l) => /xpoweredBy\s*=\s*"true"/i.test(l));
  const connectors = lines.filter((l) => /<Connector\b/i.test(l));
  const anyServerAttr = connectors.some((l) => /\bserver\s*=\s*"/i.test(l));
  const ok = !xpowered && (connectors.length === 0 || anyServerAttr);
  return { id: "WAS-08", status: ok ? "pass" : "fail", evidence: ok ? "버전/헤더 정보 노출이 제한됨(server 속성 설정, xpoweredBy 미사용)" : `헤더 정보 노출 제한 미흡 (xpoweredBy: ${xpowered}, server 속성: ${anyServerAttr})` };
}

export function evaluateWAS09(tasks: AnsibleTaskOutput[]): CheckResult {
  const present = /AccessLogValve/.test(getTomcatState(tasks).serverXml);
  return { id: "WAS-09", status: present ? "pass" : "fail", evidence: present ? "AccessLogValve(접근 로깅)가 설정됨" : "AccessLogValve가 설정되어 있지 않음" };
}

export function evaluateWAS10(tasks: AnsibleTaskOutput[]): CheckResult {
  const lines = activeLines(getTomcatState(tasks).serverXml);
  const trace = lines.some((l) => /<Connector\b[^>]*allowTrace\s*=\s*"true"/i.test(l));
  return { id: "WAS-10", status: trace ? "fail" : "pass", evidence: trace ? "커넥터에 allowTrace=\"true\"(TRACE 허용)가 설정됨" : "TRACE 메서드가 허용되어 있지 않음(allowTrace 미사용)" };
}

export function evaluateWAS11(tasks: AnsibleTaskOutput[]): CheckResult {
  const { version, processLine } = getTomcatState(tasks);
  const major = parseTomcatMajor(version);
  if (major !== null && major >= 10) {
    return { id: "WAS-11", status: "pass", evidence: `Tomcat ${major}.x — SecurityManager는 deprecated로 해당 없음` };
  }
  if (major === null) {
    return { id: "WAS-11", status: "review", evidence: "Tomcat 버전을 확인할 수 없어 SecurityManager 판정 불가 — 수동/AI 확인" };
  }
  const securityOn = /-security\b/.test(processLine);
  return { id: "WAS-11", status: securityOn ? "pass" : "fail", evidence: securityOn ? `Tomcat ${major}.x — SecurityManager(-security) 활성` : `Tomcat ${major}.x — SecurityManager(-security)가 활성화되어 있지 않음` };
}

export function evaluateWAS12(tasks: AnsibleTaskOutput[]): CheckResult {
  const version = getTomcatState(tasks).version || "확인 불가";
  return { id: "WAS-12", status: "review", evidence: `Tomcat 버전: ${version} — 정적 점검만으로 최신 패치 적용 여부를 단정할 수 없어 벤더 권고와 대조 필요` };
}
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit
git add src/lib/packs/wasTomcat.ts src/lib/packs/wasTomcat.test.ts
git commit -m "feat: was-tomcat 평가기 WAS-07~12 (#was-tomcat)"
```

---

## Task 5: 팩 조립 + 레지스트리 등록

**Files:** Modify `src/lib/packs/wasTomcat.ts`, `src/lib/packs/registry.ts`, `src/lib/packs/registry.test.ts`, `src/lib/packs/resolve.test.ts`, `src/lib/packs/wasTomcat.test.ts`

**Interfaces:**
- Produces: `wasTomcatPack: VendorPack`; `ALL_PACKS`에 등록.

- [ ] **Step 1: 실패 테스트** — `wasTomcat.test.ts`에 추가 + registry/resolve 갱신:

```ts
import { wasTomcatPack } from "./wasTomcat";
import { getCatalogByCategory } from "@/lib/catalog";

it("wasTomcatPack shape + evaluate one result per WAS item", () => {
  const wasIds = getCatalogByCategory("was").map((i) => i.id).sort();
  expect(wasTomcatPack.id).toBe("was-tomcat");
  expect(wasTomcatPack.vendors).toEqual(["Tomcat"]);
  expect(wasTomcatPack.itemIds.slice().sort()).toEqual(wasIds);
  const present = [{ taskName: "tomcat detection (internal)", stdout: "present:/opt/tomcat" }];
  expect(wasTomcatPack.evaluate({ findings: null, tasks: present }).map((r) => r.id).sort()).toEqual(wasIds);
  expect(wasTomcatPack.detect(present)).toBe(true);
  expect(wasTomcatPack.detect([])).toBe(false);
});
```
  `registry.test.ts`: `ALL_PACKS` 정렬 단언에 `"was-tomcat"` 추가; `findVendorPack("WAS","Tomcat")?.id === "was-tomcat"` / 소문자 `"tomcat"`도.
  `resolve.test.ts`: `server+WAS/Tomcat → ["os-unix","was-tomcat"]`, evidenceTasks에 `"tomcat detection (internal)"` 포함.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `wasTomcat.ts` 하단:

```ts
import { getCatalogByCategory } from "@/lib/catalog";
import type { EvalContext, VendorPack } from "./types";

function evaluateTomcat(ctx: EvalContext): CheckResult[] {
  const t = ctx.tasks;
  return [
    evaluateWAS01(t), evaluateWAS02(t), evaluateWAS03(t), evaluateWAS04(t), evaluateWAS05(t), evaluateWAS06(t),
    evaluateWAS07(t), evaluateWAS08(t), evaluateWAS09(t), evaluateWAS10(t), evaluateWAS11(t), evaluateWAS12(t),
  ];
}

export const wasTomcatPack: VendorPack = {
  id: "was-tomcat",
  category: "WAS",
  vendors: ["Tomcat"],
  executionPath: "linux",
  itemIds: getCatalogByCategory("was").map((i) => i.id),
  evidenceTasks: TOMCAT_EVIDENCE,
  detect: (tasks) => getTomcatState(tasks).present,
  evaluate: evaluateTomcat,
};
```
  `registry.ts`: `import { wasTomcatPack } from "./wasTomcat";` + `ALL_PACKS`에 `wasTomcatPack` 추가.

- [ ] **Step 4: 통과 + 전체 스위트** — `npx vitest run` → PASS.

- [ ] **Step 5: 게이트 + 커밋**

```bash
npx tsc --noEmit && npx eslint src/lib/packs/wasTomcat.ts src/lib/packs/registry.ts
git add src/lib/packs/wasTomcat.ts src/lib/packs/registry.ts src/lib/packs/registry.test.ts src/lib/packs/resolve.test.ts src/lib/packs/wasTomcat.test.ts
git commit -m "feat: was-tomcat 팩 조립 + 레지스트리 등록 (#was-tomcat)"
```

---

## Task 6: 실제 흐름 검증 (Docker Tomcat E2E)

**Files:** (코드 변경 없음 — 검증. 버그 발견 시 최소 수정 후 별도 커밋.)

- [ ] **Step 1: 전체 단위 테스트 그린** — `npx vitest run` PASS.

- [ ] **Step 2: Tomcat 테스트 대상 준비** — 컨테이너에 Tomcat 설치(예: `apt-get install -y tomcat9` 또는 공식 tarball을 `/opt/tomcat`에 배치 후 기동). 기본 설정(샘플앱·기본 server.xml)을 유지해 실제 판정이 드러나게 한다.
```bash
docker exec <container> sh -c 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tomcat9 tomcat9-examples tomcat9-admin 2>/dev/null; ls /var/lib/tomcat9/webapps 2>/dev/null || ls /usr/share/tomcat9'
```
  DB에 `category=WAS, vendor=Tomcat` 서버 자산이 없으면 등록(해당 컨테이너 SSH 접속정보). 기존 `테스트-WAS-Tomcat`(2233) 자산 재활용 가능.

- [ ] **Step 3: positive 검증** — 실제 프로덕션 경로(tsx로 `resolveCheckPlan`→`runAnsibleForServer(asset, plan.evidenceTasks)`→`evaluatePlan`)로 점검. 기대:
  - packs = `os-unix, was-tomcat`, tomcat 증거 태스크 합성.
  - U-* 베이스라인 + WAS-*가 실제 pass/fail/review(전부 review 아님).
  - 기본 설치라면 WAS-01(샘플앱)·WAS-07(autoDeploy)·WAS-02(기본 shutdown) 등이 fail로 잡히는지 확인.

- [ ] **Step 4: negative 검증** — Tomcat 없는 컨테이너를 `WAS/Tomcat`로 점검 → WAS-* 전부 `review`("선언된 Tomcat 미확인").

- [ ] **Step 5: OS 베이스라인 병존 + 컴플라이언스 필터** — WAS 결과에 U-* 병존, 카탈로그/리포트에서 CIS 필터로 WAS 항목만 보기 동작.

- [ ] **Step 6: (선택) AI 흡수** — `CLAUDE_ANALYSIS_ENABLED=true`로 WAS-12 review가 AI 판정(source=ai)으로 흡수되는지 확인.

- [ ] **Step 7: 최종 게이트** — `npx tsc --noEmit && npx eslint <touched> && npx vitest run` 그린.

---

## Self-Review (완료)

- **스펙 커버리지:** 카탈로그 신설(T1), 증거+상태(T2), WAS-01~12 판정 전 항목(T3/T4, 스펙 표와 분류 일치), 조립·등록(T5), E2E(T6). review 최소화: WAS-12만 review(+WAS-03/11 불명 시 review), AI 흡수는 #2a 재사용.
- **플레이스홀더:** 각 평가기·테스트·카탈로그 데이터 완전 포함.
- **타입 일관성:** `getTomcatState`/`activeLines`/`noGroupOtherWrite`/`parseTomcatMajor`, `evaluateWAS01..12(tasks)`, `wasTomcatPack`(VendorPack), `getCatalogByCategory("was")`가 태스크 전반 일치.
- **주의:** WAS 평가기가 XML을 정규식으로 파싱(간이). 주석은 `activeLines`가 제거하나 다중 커넥터/멀티라인 태그는 단순화된 처리 — E2E(T6)와 최종 리뷰에서 실제 기본 server.xml 대비 타당성 확인. `HOME_RESOLVE` 셸 조각의 와일드카드(`/opt/apache-tomcat*`)·따옴표를 이스케이프 정확히.
