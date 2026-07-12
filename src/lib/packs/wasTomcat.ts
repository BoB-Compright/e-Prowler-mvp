import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { PlaybookTask } from "./types";

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
