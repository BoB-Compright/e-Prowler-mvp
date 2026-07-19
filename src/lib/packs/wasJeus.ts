import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { EvalContext, PlaybookTask, ScanInputSpec, VendorPack } from "./types";

const MISSING = "__MISSING__";
// 사용자 입력(jeus_home/jeus_domain)은 Ansible `quote` 필터로 셸 인용해 주입한다 — 명령 주입 방지.
const ACC_PATH_QUOTED = `{{ (jeus_home + "/domains/" + jeus_domain + "/config/accounts.xml") | quote }}`;
const DOM_PATH_QUOTED = `{{ (jeus_home + "/domains/" + jeus_domain + "/config/domain.xml") | quote }}`;
const KEY_PATH_QUOTED = `{{ (jeus_home + "/domains/" + jeus_domain + "/config/security/security.key") | quote }}`;

const REQUIRED_INPUTS: ScanInputSpec[] = [
  { name: "jeus_home", label: "설치 경로(JEUS_HOME)", kind: "path", required: true, placeholder: "/home/jeus/jeus7" },
  { name: "jeus_domain", label: "도메인명", kind: "text", required: true, placeholder: "jeus_domain" },
];

// 파일기반 증거(계정/도메인 설정 파일 내용·권한). 티베로 TB-13/14와 동일 패턴으로,
// `sh -c` 래퍼 없이 quote 필터로 인용된 경로를 `p=`에 담아 `"$p"`로만 참조한다.
const EVIDENCE: PlaybookTask[] = [
  { name: "JE: accounts.xml content",
    raw: `p=${ACC_PATH_QUOTED}\nif [ -f "$p" ]; then cat "$p"; else echo ${MISSING}; fi` },
  { name: "JE: accounts.xml perms",
    raw: `p=${ACC_PATH_QUOTED}\nif [ -f "$p" ]; then stat -c "%U:%G %a" "$p"; else echo ${MISSING}; fi` },
  { name: "JE: domain.xml content",
    raw: `p=${DOM_PATH_QUOTED}\nif [ -f "$p" ]; then cat "$p"; else echo ${MISSING}; fi` },
  { name: "JE: security.key perms",
    raw: `p=${KEY_PATH_QUOTED}\nif [ -f "$p" ]; then stat -c "%U:%G %a" "$p"; else echo ${MISSING}; fi` },
];

const ITEM_IDS = [
  "JE-01", "JE-02", "JE-03", "JE-04", "JE-05", "JE-06", "JE-07",
  "JE-08", "JE-09", "JE-10", "JE-11", "JE-12", "JE-13",
];

function taskStdout(tasks: AnsibleTaskOutput[], name: string): string {
  return tasks.find((t) => t.taskName === name)?.stdout ?? "";
}

// __MISSING__ 센티널만 "파일 없음"으로 취급한다. 실제로 존재하지만 내용이 빈 파일은
// (센티널이 아니므로) 평가 단계로 넘어가야 한다 — 파일 없음과 빈 파일을 구분한다.
function isMissing(stdout: string): boolean {
  return stdout.trim() === MISSING;
}

// "user:group mode" 형태에서 mode를 파싱한다. 3자리(또는 앞에 0이 붙은 4자리) 8진수
// 표기가 아니면 파싱 실패로 null을 반환해, 호출부가 fail-closed(review)로 처리하게 한다.
function parseMode(perms: string): string | null {
  const raw = perms.trim().split(/\s+/)[1] ?? "";
  if (!/^[0-7]{3,4}$/.test(raw)) return null;
  return raw.length === 4 ? raw.slice(-3) : raw;
}

// JEUS 계정/키 파일은 소유자 전용이어야 한다 — group 또는 other에 어떤 비트라도
// (읽기/쓰기/실행 무관) 있으면 과다 권한으로 본다(티베로의 "쓰기 비트만" 기준보다 엄격).
function isOverPermissive(mode: string): boolean {
  const group = Number(mode[1]);
  const other = Number(mode[2]);
  return group > 0 || other > 0;
}

// accounts.xml에서 <password>...</password> 요소값과 password="..." 속성값을 모두 수집한다.
function pwValues(xml: string): string[] {
  const vals: string[] = [];
  const tagRe = /<password>([^<]*)<\/password>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) vals.push(m[1].trim());
  const attrRe = /password\s*=\s*"([^"]*)"/gi;
  while ((m = attrRe.exec(xml))) vals.push(m[1].trim());
  return vals;
}

// 기본 관리자 계정(administrator) 존재 여부.
function hasAdmin(xml: string): boolean {
  return /<name>\s*administrator\s*<\/name>/i.test(xml);
}

// 일반 정규식 검사 헬퍼(가독성용 래퍼).
function xmlHas(xml: string, re: RegExp): boolean {
  return re.test(xml);
}

// <tag>...</tag> 첫 매치의 내부 텍스트. 없으면 null.
function extractBetween(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}

// <tag>...</tag> 모든 매치의 내부 텍스트 배열(예: domain.xml 내 여러 data-source).
function extractAllBetween(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

// "{" 로 시작하지 않으면 평문 비밀번호(암호화 알고리즘 태그가 없음).
function isPlaintext(pw: string): boolean {
  return !pw.startsWith("{");
}

const FILE_MISSING = (file: string) => `${file} 파일을 찾을 수 없음(경로 확인)`;

export const jeusPack: VendorPack = {
  id: "jeus",
  category: "WAS",
  vendors: ["JEUS"],
  executionPath: "linux",
  itemIds: ITEM_IDS,
  requiredInputs: REQUIRED_INPUTS,
  evidenceTasks: EVIDENCE,
  detect(): boolean {
    // 서버(declared) 모드에서는 벤더 선언으로 이미 선택됐으므로 항상 true.
    return true;
  },
  evaluate(ctx: EvalContext): CheckResult[] {
    const provided = !!(
      ctx.inputsProvided?.has("jeus_home") && ctx.inputsProvided?.has("jeus_domain")
    );

    if (!provided) {
      return ITEM_IDS.map((id) => ({
        id,
        status: "review",
        evidence: "사전 입력값 미제공(설치 경로/도메인)",
      }));
    }

    const accXml = taskStdout(ctx.tasks, "JE: accounts.xml content");
    const accPerms = taskStdout(ctx.tasks, "JE: accounts.xml perms");
    const domXml = taskStdout(ctx.tasks, "JE: domain.xml content");
    const keyPerms = taskStdout(ctx.tasks, "JE: security.key perms");

    // --- JE-01~03: accounts.xml 내용 기반 ---
    let je01: CheckResult, je02: CheckResult, je03: CheckResult;
    if (isMissing(accXml)) {
      const ev = FILE_MISSING("accounts.xml");
      je01 = { id: "JE-01", status: "review", evidence: ev };
      je02 = { id: "JE-02", status: "review", evidence: ev };
      je03 = { id: "JE-03", status: "review", evidence: ev };
    } else {
      je01 = hasAdmin(accXml)
        ? { id: "JE-01", status: "fail", evidence: "기본 관리자 계정(administrator) 존재" }
        : { id: "JE-01", status: "pass", evidence: "administrator 계정 없음" };

      const pws = pwValues(accXml);
      je02 = pws.some(isPlaintext)
        ? { id: "JE-02", status: "fail", evidence: "관리자 비밀번호가 평문으로 저장됨" }
        : { id: "JE-02", status: "pass", evidence: "관리자 비밀번호가 모두 암호화됨" };

      je03 = pws.some((pw) => xmlHas(pw, /\{(DES|DESede|blowfish)\}/i))
        ? { id: "JE-03", status: "review", evidence: "약한 비밀번호 암호화 알고리즘(DES/DESede/blowfish) 사용" }
        : { id: "JE-03", status: "pass", evidence: "약한 암호화 알고리즘 미사용" };
    }

    // --- JE-04: accounts.xml 권한 ---
    const je04: CheckResult = isMissing(accPerms)
      ? { id: "JE-04", status: "review", evidence: FILE_MISSING("accounts.xml") }
      : (() => {
          const mode = parseMode(accPerms);
          return mode === null
            ? { id: "JE-04", status: "review", evidence: `accounts.xml 권한 형식을 확인할 수 없음: ${accPerms.trim()}` }
            : isOverPermissive(mode)
              ? { id: "JE-04", status: "fail", evidence: `accounts.xml 권한 과다(그룹/기타 접근 가능): ${accPerms.trim()}` }
              : { id: "JE-04", status: "pass", evidence: `accounts.xml 권한 양호: ${accPerms.trim()}` };
        })();

    // --- JE-05: security.key 권한 ---
    const je05: CheckResult = isMissing(keyPerms)
      ? { id: "JE-05", status: "review", evidence: FILE_MISSING("security.key") }
      : (() => {
          const mode = parseMode(keyPerms);
          return mode === null
            ? { id: "JE-05", status: "review", evidence: `security.key 권한 형식을 확인할 수 없음: ${keyPerms.trim()}` }
            : isOverPermissive(mode)
              ? { id: "JE-05", status: "fail", evidence: `security.key 권한 과다(그룹/기타 접근 가능): ${keyPerms.trim()}` }
              : { id: "JE-05", status: "pass", evidence: `security.key 권한 양호: ${keyPerms.trim()}` };
        })();

    // --- JE-06~13: domain.xml 내용 기반 ---
    let je06: CheckResult, je07: CheckResult, je08: CheckResult, je09: CheckResult,
      je10: CheckResult, je11: CheckResult, je12: CheckResult, je13: CheckResult;

    if (isMissing(domXml)) {
      const ev = FILE_MISSING("domain.xml");
      je06 = { id: "JE-06", status: "review", evidence: ev };
      je07 = { id: "JE-07", status: "review", evidence: ev };
      je08 = { id: "JE-08", status: "review", evidence: ev };
      je09 = { id: "JE-09", status: "review", evidence: ev };
      je10 = { id: "JE-10", status: "review", evidence: ev };
      je11 = { id: "JE-11", status: "review", evidence: ev };
      je12 = { id: "JE-12", status: "review", evidence: ev };
      je13 = { id: "JE-13", status: "review", evidence: ev };
    } else {
      // JE-06: session-config 안 timeout(분). 없거나 30 초과면 review.
      const sessionConfig = extractBetween(domXml, "session-config");
      const timeoutMatch = sessionConfig?.match(/<timeout>\s*(\d+)\s*<\/timeout>/i) ?? null;
      const timeoutVal = timeoutMatch ? Number(timeoutMatch[1]) : null;
      je06 = timeoutVal === null
        ? { id: "JE-06", status: "review", evidence: "세션 타임아웃 설정값을 확인할 수 없음" }
        : timeoutVal > 30
          ? { id: "JE-06", status: "review", evidence: `세션 타임아웃=${timeoutVal}분(30분 초과)` }
          : { id: "JE-06", status: "pass", evidence: `세션 타임아웃=${timeoutVal}분` };

      // JE-07: 쿠키 secure·http-only(또는 httponly) 둘 다 없으면 fail.
      const hasSecure = xmlHas(domXml, /\bsecure\b/i);
      const hasHttpOnly = xmlHas(domXml, /http-only|httponly/i);
      je07 = !hasSecure && !hasHttpOnly
        ? { id: "JE-07", status: "fail", evidence: "세션 쿠키 secure/http-only 속성 미설정" }
        : { id: "JE-07", status: "pass", evidence: "세션 쿠키 보안속성(secure/http-only) 설정 확인됨" };

      // JE-08: SSL/HTTPS 리스너 존재 여부.
      const hasSsl = xmlHas(domXml, /<ssl[\s>]|https/i);
      je08 = hasSsl
        ? { id: "JE-08", status: "pass", evidence: "SSL/TLS 리스너 설정 확인됨" }
        : { id: "JE-08", status: "fail", evidence: "SSL/TLS 리스너 설정 없음" };

      // JE-09: data-source 안 password. 평문 있으면 fail, 모두 암호화면 pass, data-source 없으면 review.
      const dsBlocks = extractAllBetween(domXml, "data-source");
      je09 = dsBlocks.length === 0
        ? { id: "JE-09", status: "review", evidence: "data-source 설정을 찾을 수 없음" }
        : (() => {
            const pws = dsBlocks.flatMap(pwValues);
            return pws.some(isPlaintext)
              ? { id: "JE-09", status: "fail", evidence: "데이터소스 DB 비밀번호가 평문으로 저장됨" }
              : { id: "JE-09", status: "pass", evidence: "데이터소스 DB 비밀번호가 모두 암호화됨" };
          })();

      // JE-10: 샘플/예제 앱(examples/console-sample) 배포 참조.
      const hasSample = xmlHas(domXml, /\bexamples\b|console-sample/i);
      je10 = hasSample
        ? { id: "JE-10", status: "review", evidence: "샘플/예제 애플리케이션 배포 참조 발견" }
        : { id: "JE-10", status: "pass", evidence: "샘플/예제 애플리케이션 배포 참조 없음" };

      // JE-11: 접근/감사 로그(access-log/logging) 설정 존재 여부.
      const hasLogging = xmlHas(domXml, /<access-log|<logging/i);
      je11 = hasLogging
        ? { id: "JE-11", status: "pass", evidence: "접근/감사 로그 설정 확인됨" }
        : { id: "JE-11", status: "review", evidence: "접근/감사 로그 설정을 확인할 수 없음" };

      // JE-12: 관리 리스너가 0.0.0.0(전체 개방)으로 바인딩돼 있으면 review.
      const bindAll = xmlHas(domXml, /0\.0\.0\.0/);
      je12 = bindAll
        ? { id: "JE-12", status: "review", evidence: "관리 리스너가 0.0.0.0(전체 개방)으로 바인딩됨" }
        : { id: "JE-12", status: "pass", evidence: "관리 리스너 바인딩이 전체 개방이 아님" };

      // JE-13: 스택트레이스 노출 또는 커스텀 에러페이지 미설정이면 fail.
      const stacktraceOn = xmlHas(domXml, /show-stacktrace[^>]*>\s*true|show-stacktrace\s*=\s*"true"/i);
      const hasErrorPage = xmlHas(domXml, /<error-page|error-page\s*=/i);
      je13 = stacktraceOn || !hasErrorPage
        ? {
            id: "JE-13",
            status: "fail",
            evidence: stacktraceOn
              ? "스택트레이스 노출 설정(show-stacktrace=true)"
              : "커스텀 에러페이지 미설정",
          }
        : { id: "JE-13", status: "pass", evidence: "스택트레이스 비노출 및 커스텀 에러페이지 설정됨" };
    }

    return [je01, je02, je03, je04, je05, je06, je07, je08, je09, je10, je11, je12, je13];
  },
};
