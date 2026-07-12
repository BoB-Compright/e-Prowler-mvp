import { getCatalogByCategory } from "@/lib/catalog";
import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { EvalContext, PlaybookTask, VendorPack } from "./types";

const MISSING = "__MISSING__";

// CATALINA_HOME은 detection이 확정하고, 후속 태스크는 동일 후보 경로를 다시 해석해
// conf 파일을 읽는다(nginx/apache 동적 경로 관례). 후보: env + 표준 설치 경로.
const HOME_RESOLVE = `H=""; for c in "$CATALINA_HOME" /opt/tomcat /usr/share/tomcat /usr/share/tomcat9 /usr/share/tomcat10 /opt/apache-tomcat* /var/lib/tomcat9 /var/lib/tomcat10; do if [ -f "$c/conf/server.xml" ]; then H="$c"; break; fi; done`;

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
  const present = activeLines(getTomcatState(tasks).serverXml).some((l) => /AccessLogValve/.test(l));
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
  const rawVersion = getTomcatState(tasks).version;
  const version = rawVersion && rawVersion !== MISSING ? rawVersion : "확인 불가";
  return { id: "WAS-12", status: "review", evidence: `Tomcat 버전: ${version} — 정적 점검만으로 최신 패치 적용 여부를 단정할 수 없어 벤더 권고와 대조 필요` };
}

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
