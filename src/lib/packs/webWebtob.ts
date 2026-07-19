import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { EvalContext, PlaybookTask, ScanInputSpec, VendorPack } from "./types";

const MISSING = "__MISSING__";
// 사용자 입력(webtob_dir)은 Ansible `quote` 필터로 셸 인용해 주입한다 — 명령 주입 방지.
const HTTPM_PATH_QUOTED = `{{ (webtob_dir + "/config/http.m") | quote }}`;

const REQUIRED_INPUTS: ScanInputSpec[] = [
  { name: "webtob_dir", label: "설치 경로(WEBTOBDIR)", kind: "path", required: true, placeholder: "/home/webtob" },
];

// 파일기반 증거(http.m 내용·권한). 티베로/JEUS와 동일 패턴으로 `sh -c` 래퍼 없이
// quote 필터로 인용된 경로를 `p=`에 담아 `"$p"`로만 참조한다.
const EVIDENCE: PlaybookTask[] = [
  { name: "WT: http.m content",
    raw: `p=${HTTPM_PATH_QUOTED}\nif [ -f "$p" ]; then cat "$p"; else echo ${MISSING}; fi` },
  { name: "WT: http.m perms",
    raw: `p=${HTTPM_PATH_QUOTED}\nif [ -f "$p" ]; then stat -c "%U:%G %a" "$p"; else echo ${MISSING}; fi` },
];

const ITEM_IDS = ["WT-01", "WT-02", "WT-03", "WT-04", "WT-05", "WT-06", "WT-07", "WT-08", "WT-09"];

function taskStdout(tasks: AnsibleTaskOutput[], name: string): string {
  return tasks.find((t) => t.taskName === name)?.stdout ?? "";
}

// __MISSING__ 센티널만 "파일 없음"으로 취급한다. 실제로 존재하지만 내용이 빈 파일은
// (센티널이 아니므로) 평가 단계로 넘어가야 한다 — 파일 없음과 빈 파일을 구분한다.
function isMissing(stdout: string): boolean {
  return stdout.trim() === MISSING;
}

// http.m에서 특정 `Name = "value"` 지시어의 값을 추출한다(대소문자 무시). 지시어가
// 없으면 null을 반환해, 호출부가 "설정 없음"과 "값이 있지만 안전"을 구분하게 한다.
// 반드시 지시어 라인(`Name` 뒤에 `=`)만 매치하며, 파일 전체를 훑는 substring 검사가
// 아니므로 주석/다른 지시어의 값 안에 우연히 토큰이 등장해도 오탐(fail-open)하지 않는다.
function directive(text: string, name: string): string | null {
  const re = new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*"([^"]*)"`, "im");
  const m = text.match(re);
  return m ? m[1] : null;
}

// http.m에 특정 섹션 헤더(`*SSL`, `*LOGGING`, `*ADMIN` 등)가 존재하는지.
function hasSection(text: string, section: string): boolean {
  return new RegExp(`^[ \\t]*\\*${section}\\b`, "im").test(text);
}

// "user:group mode" 형태에서 mode를 파싱한다. 3자리(또는 앞에 0이 붙은 4자리) 8진수
// 표기가 아니면 파싱 실패로 null을 반환해, 호출부가 fail-closed(review)로 처리하게 한다.
function parseMode(perms: string): string | null {
  const raw = perms.trim().split(/\s+/)[1] ?? "";
  if (!/^[0-7]{3,4}$/.test(raw)) return null;
  return raw.length === 4 ? raw.slice(-3) : raw;
}

// 그룹/기타 쓰기 비트가 있으면 과다 권한.
function isOverPermissive(mode: string): boolean {
  const group = Number(mode[1]);
  const other = Number(mode[2]);
  return (group & 2) === 2 || (other & 2) === 2;
}

const DANGEROUS_METHODS = ["PUT", "DELETE", "TRACE", "OPTIONS", "CONNECT", "PATCH"];

const FILE_MISSING = "http.m 파일을 찾을 수 없음(경로 확인)";

export const webtobPack: VendorPack = {
  id: "webtob",
  category: "WEB",
  vendors: ["WebtoB"],
  executionPath: "linux",
  itemIds: ITEM_IDS,
  requiredInputs: REQUIRED_INPUTS,
  evidenceTasks: EVIDENCE,
  detect(): boolean {
    // 서버(declared) 모드에서는 벤더 선언으로 이미 선택됐으므로 항상 true.
    return true;
  },
  evaluate(ctx: EvalContext): CheckResult[] {
    const provided = !!ctx.inputsProvided?.has("webtob_dir");

    if (!provided) {
      return ITEM_IDS.map((id) => ({
        id,
        status: "review",
        evidence: "사전 입력값 미제공(설치 경로)",
      }));
    }

    const httpm = taskStdout(ctx.tasks, "WT: http.m content");
    const perms = taskStdout(ctx.tasks, "WT: http.m perms");

    // --- WT-02: http.m 파일 권한(내용과 독립적으로 perms 태스크만 사용) ---
    const wt02: CheckResult = isMissing(perms)
      ? { id: "WT-02", status: "review", evidence: FILE_MISSING }
      : (() => {
          const mode = parseMode(perms);
          return mode === null
            ? { id: "WT-02", status: "review", evidence: `http.m 권한 형식을 확인할 수 없음: ${perms.trim()}` }
            : isOverPermissive(mode)
              ? { id: "WT-02", status: "fail", evidence: `http.m 권한 과다(그룹/기타 쓰기 가능): ${perms.trim()}` }
              : { id: "WT-02", status: "pass", evidence: `http.m 권한 양호: ${perms.trim()}` };
        })();

    // --- WT-01/03~09: http.m 내용 기반 ---
    let wt01: CheckResult, wt03: CheckResult, wt04: CheckResult, wt05: CheckResult,
      wt06: CheckResult, wt07: CheckResult, wt08: CheckResult, wt09: CheckResult;

    if (isMissing(httpm)) {
      const ev = FILE_MISSING;
      wt01 = { id: "WT-01", status: "review", evidence: ev };
      wt03 = { id: "WT-03", status: "review", evidence: ev };
      wt04 = { id: "WT-04", status: "review", evidence: ev };
      wt05 = { id: "WT-05", status: "review", evidence: ev };
      wt06 = { id: "WT-06", status: "review", evidence: ev };
      wt07 = { id: "WT-07", status: "review", evidence: ev };
      wt08 = { id: "WT-08", status: "review", evidence: ev };
      wt09 = { id: "WT-09", status: "review", evidence: ev };
    } else {
      // WT-01: Options 지시어 값에 INDEX 토큰(디렉터리 리스팅)이 있으면 fail.
      const optionsVal = directive(httpm, "Options");
      const optionTokens = (optionsVal ?? "").split(",").map((s) => s.trim().toUpperCase());
      wt01 = optionTokens.includes("INDEX")
        ? { id: "WT-01", status: "fail", evidence: `Options에 INDEX(디렉터리 리스팅) 설정됨: ${optionsVal}` }
        : { id: "WT-01", status: "pass", evidence: `Options에 INDEX 미설정${optionsVal ? `: ${optionsVal}` : "(Options 미설정)"}` };

      // WT-03: Method 지시어 값에 위험 메서드가 있으면 fail. 지시어 자체가 없으면
      // 기본 허용 메서드로 동작할 수 있어 review(안전 확정 불가). GET/POST/HEAD만 있으면 pass.
      const methodVal = directive(httpm, "Method");
      if (methodVal === null) {
        wt03 = { id: "WT-03", status: "review", evidence: "Method 지시어 미설정(기본 허용 메서드 확인 필요)" };
      } else {
        const methodTokens = methodVal.split(",").map((s) => s.trim().toUpperCase());
        const dangerous = methodTokens.filter((m) => DANGEROUS_METHODS.includes(m));
        wt03 = dangerous.length > 0
          ? { id: "WT-03", status: "fail", evidence: `위험한 HTTP 메서드 허용됨: ${dangerous.join(", ")}` }
          : { id: "WT-03", status: "pass", evidence: `허용 메서드 양호: ${methodVal}` };
      }

      // WT-04: ErrorDocument 지시어 없으면 review(기본 에러페이지 노출 가능), 있으면 pass.
      const errorDoc = directive(httpm, "ErrorDocument");
      wt04 = errorDoc === null
        ? { id: "WT-04", status: "review", evidence: "ErrorDocument 미설정(기본 에러페이지 노출 가능)" }
        : { id: "WT-04", status: "pass", evidence: `ErrorDocument 설정됨: ${errorDoc}` };

      // WT-05: *SSL 섹션 또는 SSLFlag/443 관련 설정 있으면 pass, 없으면 fail.
      const hasSsl = hasSection(httpm, "SSL") || /SSLFlag|:\s*443\b|\b443\b/i.test(httpm);
      wt05 = hasSsl
        ? { id: "WT-05", status: "pass", evidence: "SSL/TLS 설정 확인됨" }
        : { id: "WT-05", status: "fail", evidence: "SSL/TLS 설정 없음" };

      // WT-06: *LOGGING 섹션 또는 Logging 지시어 있으면 pass, 없으면 review.
      const hasLogging = hasSection(httpm, "LOGGING") || directive(httpm, "Logging") !== null;
      wt06 = hasLogging
        ? { id: "WT-06", status: "pass", evidence: "접근 로그(Logging) 설정 확인됨" }
        : { id: "WT-06", status: "review", evidence: "접근 로그(Logging) 설정을 확인할 수 없음" };

      // WT-07: 요청 제한 관련 지시어(MaxUser/Timeout/요청 크기) 없으면 review, 있으면 pass.
      const hasLimit = directive(httpm, "MaxUser") !== null
        || directive(httpm, "Timeout") !== null
        || directive(httpm, "MaxRequestBodySize") !== null;
      wt07 = hasLimit
        ? { id: "WT-07", status: "pass", evidence: "요청 제한(MaxUser/Timeout 등) 설정 확인됨" }
        : { id: "WT-07", status: "review", evidence: "요청 제한 관련 설정을 확인할 수 없음" };

      // WT-08: Options 값에 상위경로/심볼릭 링크 허용(FollowSymLinks)이 있으면 fail.
      wt08 = optionTokens.includes("FOLLOWSYMLINKS")
        ? { id: "WT-08", status: "fail", evidence: `상위경로/심볼릭 링크 허용 설정됨: ${optionsVal}` }
        : { id: "WT-08", status: "pass", evidence: "상위경로/심볼릭 링크 허용 설정 없음" };

      // WT-09: *ADMIN 섹션이 있고 접근제어(Admin_ip 등)가 전체 개방(0.0.0.0)이거나
      // 확인할 수 없으면 review. 섹션 자체가 없으면 관리 리스너 미노출로 간주해 pass.
      const adminSection = hasSection(httpm, "ADMIN");
      if (!adminSection) {
        wt09 = { id: "WT-09", status: "pass", evidence: "관리(Admin) 리스너 설정 없음" };
      } else {
        const adminIp = directive(httpm, "Admin_ip");
        wt09 = adminIp === null || adminIp.trim() === "0.0.0.0"
          ? { id: "WT-09", status: "review", evidence: "관리(Admin) 리스너 접근제어가 전체 개방이거나 확인 불가" }
          : { id: "WT-09", status: "pass", evidence: `관리(Admin) 리스너 접근제어 설정됨: ${adminIp}` };
      }
    }

    return [wt01, wt02, wt03, wt04, wt05, wt06, wt07, wt08, wt09];
  },
};
