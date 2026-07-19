import type { AnsibleTaskOutput } from "@/lib/checks/ansibleRunner";
import type { CheckResult } from "@/lib/checks/types";
import type { EvalContext, PlaybookTask, ScanInputSpec, VendorPack } from "./types";

const MISSING = "__MISSING__";
// 사용자 입력(tibero_home/tibero_tbsid)은 Ansible `quote` 필터로 셸 인용해 주입한다 — 명령 주입 방지.
const TIP_PATH_QUOTED = `{{ (tibero_home + "/config/" + tibero_tbsid + ".tip") | quote }}`;

const REQUIRED_INPUTS: ScanInputSpec[] = [
  { name: "tibero_home", label: "설치 경로(TB_HOME)", kind: "path", required: true, placeholder: "/home/tibero/tibero7" },
  { name: "tibero_tbsid", label: "인스턴스(TB_SID)", kind: "text", required: true, placeholder: "tibero" },
  { name: "tibero_db_user", label: "DB 계정", kind: "text", required: true, help: "DBA 권한 계정(예: sys)", placeholder: "sys" },
  { name: "tibero_db_pass", label: "DB 비밀번호", kind: "secret", required: true, help: "tbSQL 로그인용(암호화 저장)" },
  { name: "tibero_listener_port", label: "리스너 포트", kind: "text", required: false, placeholder: "8629" },
];

// tbSQL 접속 변수는 quote 필터로 셸 인용해 변수에 담고, 비밀번호는 argv가 아닌
// CONN(stdin)으로 전달한다 — ps 노출·명령 주입 모두 방지.
const DBUSER_Q = `{{ tibero_db_user | quote }}`;
const DBPASS_Q = `{{ tibero_db_pass | quote }}`;
const TBSID_Q = `{{ tibero_tbsid | quote }}`;

// TB-02: SYS 기본 비밀번호(tibero)로 로그인 시도. 성공하면 기본비번 사용(취약).
// 기본비번 문자열은 사용자 입력이 아니지만 형식 일관성 위해 리터럴로 둔다.
const SYS_DEFAULT_LOGIN: PlaybookTask = {
  name: "TB-DB: tibero sys default login",
  raw: [
    `s=${TBSID_Q}`,
    `out=$(printf 'CONN SYS/tibero@%s\\nPROMPT __SYSLOGIN_OK__\\nEXIT\\n' "$s" | tbsql -s /nolog 2>&1)`,
    `if printf '%s' "$out" | grep -q __SYSLOGIN_OK__; then echo __SYS_DEFAULT_PW__; else echo __SYS_DEFAULT_PW_ABSENT__; fi`,
  ].join("\n"),
};

// TB-01/03~12: 사용자 제공 DBA 계정으로 접속해 시스템 뷰·파라미터를 한 세션에서 조회.
// 각 결과 앞에 ###TBnn 마커를 찍어 evaluate가 섹션을 분리한다. 접속 성공 시에만 마커가 나온다.
const DB_QUERIES: PlaybookTask = {
  name: "TB-DB: tibero queries",
  raw: [
    `u=${DBUSER_Q}`,
    `p=${DBPASS_Q}`,
    `s=${TBSID_Q}`,
    `{`,
    `  printf 'CONN %s/%s@%s\\n' "$u" "$p" "$s"`,
    `  printf 'SET HEADING OFF FEEDBACK OFF PAGESIZE 0 LINESIZE 300\\n'`,
    `  printf 'PROMPT __CONN_OK__\\n'`,
    `  printf 'PROMPT ###TB01\\n'`,
    `  printf "SELECT username||'|'||account_status FROM dba_users;\\n"`,
    `  printf 'PROMPT ###TB03\\n'`,
    `  printf "SELECT grantee FROM dba_role_privs WHERE granted_role='DBA';\\n"`,
    `  printf 'PROMPT ###TB04\\n'`,
    `  printf "SELECT grantee||'|'||privilege FROM dba_sys_privs WHERE privilege LIKE '%%ANY%%';\\n"`,
    `  printf 'PROMPT ###TBPROF\\n'`,
    `  printf "SELECT profile||'|'||resource_name||'|'||limit FROM dba_profiles WHERE resource_name IN ('FAILED_LOGIN_ATTEMPTS','PASSWORD_LOCK_TIME','PASSWORD_LIFE_TIME','PASSWORD_REUSE_TIME','PASSWORD_REUSE_MAX','PASSWORD_VERIFY_FUNCTION','SESSIONS_PER_USER');\\n"`,
    `  printf 'PROMPT ###TB11\\n'`,
    `  printf "SELECT name||'|'||value FROM v\\$parameter WHERE name IN ('audit_trail','audit_sys_operations');\\n"`,
    `  printf 'EXIT\\n'`,
    `} | tbsql -s /nolog 2>&1`,
  ].join("\n"),
};

// 파일기반 증거(TB-13/14) + tbSQL 인증 쿼리 evidence(TB-01/02~12, 안전 접속).
// evaluate()의 TB-01~12 판정 로직은 다음 태스크에서 추가된다.
const EVIDENCE: PlaybookTask[] = [
  { name: "TB-13: tibero tip content",
    raw: `p=${TIP_PATH_QUOTED}\nif [ -f "$p" ]; then cat "$p"; else echo ${MISSING}; fi` },
  { name: "TB-14: tibero tip perms",
    raw: `p=${TIP_PATH_QUOTED}\nif [ -f "$p" ]; then stat -c "%U:%G %a" "$p"; else echo ${MISSING}; fi` },
  SYS_DEFAULT_LOGIN,
  DB_QUERIES,
];

function taskStdout(tasks: AnsibleTaskOutput[], name: string): string {
  return tasks.find((t) => t.taskName === name)?.stdout ?? "";
}

// __MISSING__ 센티널만 "파일 없음"으로 취급한다. 실제로 존재하지만 내용이 빈 파일은
// (센티널이 아니므로) 평가 단계로 넘어가야 한다 — 그래야 "빈 .tip = ACL 없음 = fail"이
// "파일을 찾을 수 없음(review)"으로 잘못 뭉개지지 않는다.
function isMissing(stdout: string): boolean {
  return stdout.trim() === MISSING;
}

// .tip 텍스트에서 리스너 IP 접근제어 설정(LSNR_INVITED_IP/DENIED_IP 또는 파일 지정)이 있는지.
// `=` 뒤에 공백이 아닌 값이 최소 1자 있어야 "설정됨"으로 인정한다(빈 값은 미설정).
function hasListenerAcl(tip: string): boolean {
  return /^[ \t]*(LSNR_INVITED_IP|LSNR_DENIED_IP|LSNR_INVITED_IP_FILE|LSNR_DENIED_IP_FILE)[ \t]*=[ \t]*\S/im.test(tip);
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
  return (group & 2) === 2 || (other & 2) === 2; // 쓰기 비트
}

// TB-01 기본계정 목록(미사용 시 잠금/만료돼 있어야 하는 계정들).
const DEFAULT_ACCOUNTS = ["SYS", "SYSCAT", "SYSGIS", "OUTLN", "SYSBACKUP", "TIBERO", "TIBERO1", "LBACSYS"];

// tbSQL 쿼리 출력을 ###마커로 섹션 분할한다. 각 섹션은 마커 다음부터 다음 마커(또는 끝)까지의 라인.
function splitSections(out: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let cur: string | null = null;
  for (const line of out.split("\n")) {
    const m = line.match(/^###(TB01|TB03|TB04|TBPROF|TB11)\s*$/);
    if (m) { cur = m[1]; sections[cur] = []; continue; }
    if (cur && line.trim()) sections[cur].push(line.trim());
  }
  return sections;
}

// DBA_PROFILES 섹션에서 특정 resource_name의 DEFAULT 프로파일 limit 값을 찾는다(대문자 무시).
function profileLimit(profRows: string[], resource: string): string | null {
  for (const row of profRows) {
    const [prof, res, limit] = row.split("|");
    if (prof?.toUpperCase() === "DEFAULT" && res?.toUpperCase() === resource.toUpperCase()) return (limit ?? "").trim();
  }
  return null;
}

export const tiberoPack: VendorPack = {
  id: "tibero",
  category: "DB",
  vendors: ["Tibero"],
  executionPath: "linux",
  itemIds: ["TB-01", "TB-02", "TB-03", "TB-04", "TB-05", "TB-06", "TB-07", "TB-08", "TB-09", "TB-10", "TB-11", "TB-12", "TB-13", "TB-14"],
  requiredInputs: REQUIRED_INPUTS,
  evidenceTasks: EVIDENCE,
  detect(): boolean {
    // 서버(declared) 모드에서는 벤더 선언으로 이미 선택됐으므로 항상 true.
    return true;
  },
  evaluate(ctx: EvalContext): CheckResult[] {
    const pathProvided = ctx.inputsProvided?.has("tibero_home") && ctx.inputsProvided?.has("tibero_tbsid");
    const tipRaw = taskStdout(ctx.tasks, "TB-13: tibero tip content");
    const permsRaw = taskStdout(ctx.tasks, "TB-14: tibero tip perms");

    const tb13: CheckResult = !pathProvided
      ? { id: "TB-13", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : isMissing(tipRaw)
        ? { id: "TB-13", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : hasListenerAcl(tipRaw)
          ? { id: "TB-13", status: "pass", evidence: "리스너 IP 접근제어 설정됨" }
          : { id: "TB-13", status: "fail", evidence: "리스너 IP 접근제어(LSNR_INVITED_IP/DENIED_IP) 미설정" };

    const mode = isMissing(permsRaw) ? null : parseMode(permsRaw);
    const tb14: CheckResult = !pathProvided
      ? { id: "TB-14", status: "review", evidence: "사전 입력값 미제공(설치 경로/인스턴스)" }
      : isMissing(permsRaw)
        ? { id: "TB-14", status: "review", evidence: ".tip 파일을 찾을 수 없음(경로 확인)" }
        : mode === null
          ? { id: "TB-14", status: "review", evidence: `설정파일 권한 형식을 확인할 수 없음: ${permsRaw.trim()}` }
          : isOverPermissive(mode)
            ? { id: "TB-14", status: "fail", evidence: `설정파일 권한 과다: ${permsRaw.trim()}` }
            : { id: "TB-14", status: "pass", evidence: `설정파일 권한 양호: ${permsRaw.trim()}` };

    // TB-02: SYS 기본 비밀번호 로그인 시도 결과. dbInputsProvided/connOk와 독립적으로,
    // 자체 로그인 시도 결과(sysOut)만으로 판정한다.
    const sysOut = taskStdout(ctx.tasks, "TB-DB: tibero sys default login");
    const tb02: CheckResult = sysOut.includes("__SYS_DEFAULT_PW_ABSENT__")
      ? { id: "TB-02", status: "pass", evidence: "SYS 계정 기본 비밀번호 로그인 실패(기본비번 아님)" }
      : sysOut.includes("__SYS_DEFAULT_PW__")
        ? { id: "TB-02", status: "fail", evidence: "SYS 계정 기본 비밀번호로 로그인 성공" }
        : { id: "TB-02", status: "review", evidence: "SYS 기본 비밀번호 점검 결과를 확인할 수 없음" };

    // TB-01/03~12: 사용자 제공 DBA 계정으로 접속한 tbSQL 쿼리 결과 기반 판정.
    const dbInputsProvided = !!(
      ctx.inputsProvided?.has("tibero_db_user") &&
      ctx.inputsProvided?.has("tibero_db_pass") &&
      ctx.inputsProvided?.has("tibero_tbsid")
    );
    const queriesOut = taskStdout(ctx.tasks, "TB-DB: tibero queries");
    const connOk = queriesOut.includes("__CONN_OK__");
    const dbIds = ["TB-01", "TB-03", "TB-04", "TB-05", "TB-06", "TB-07", "TB-08", "TB-09", "TB-10", "TB-11", "TB-12"];

    let db: Record<string, CheckResult>;
    if (!dbInputsProvided) {
      db = Object.fromEntries(
        dbIds.map((id) => [id, { id, status: "review", evidence: "사전 입력값 미제공(DB 계정/비밀번호/인스턴스)" } as CheckResult]),
      );
    } else if (!connOk) {
      db = Object.fromEntries(
        dbIds.map((id) => [id, { id, status: "review", evidence: "DB 인증 실패" } as CheckResult]),
      );
    } else {
      const sections = splitSections(queriesOut);
      const tb01Rows = sections.TB01 ?? [];
      // DBA_USERS는 세션이 정상 동작하면 항상 SYS를 포함해 1행 이상을 반환한다.
      // ###TB01 섹션이 비어있다면 __CONN_OK__를 봤더라도 쿼리 배치 중간에 에러가 나서
      // 실제로는 결과를 얻지 못했다는 뜻(시스템이 안전하다는 뜻이 아니다) — fail-closed로
      // TB-01/03~12 전체를 review 처리한다("빈 섹션 = pass"로 잘못 해석하지 않도록).
      const queriesRan = tb01Rows.length > 0;

      if (!queriesRan) {
        db = Object.fromEntries(
          dbIds.map((id) => [id, { id, status: "review", evidence: "DB 조회 결과 없음 — 쿼리 실행 확인 필요" } as CheckResult]),
        );
      } else {
        const tb03Rows = sections.TB03 ?? [];
        const tb04Rows = sections.TB04 ?? [];
        const profRows = sections.TBPROF ?? [];
        const tb11Rows = sections.TB11 ?? [];

        // TB-01: 기본계정이 하나라도 OPEN이면 fail(보수적으로 판단).
        const openDefaults = tb01Rows
          .filter((row) => {
            const [account, status] = row.split("|");
            return DEFAULT_ACCOUNTS.includes((account ?? "").trim().toUpperCase()) && (status ?? "").trim().toUpperCase() === "OPEN";
          })
          .map((row) => row.split("|")[0]);
        const tb01: CheckResult =
          openDefaults.length > 0
            ? { id: "TB-01", status: "fail", evidence: `기본계정 OPEN 상태 확인됨: ${openDefaults.join(", ")}` }
            : { id: "TB-01", status: "pass", evidence: "기본계정 모두 LOCK/EXPIRED 상태" };

        // TB-03: SYS를 제외한 grantee가 하나라도 있으면 fail.
        const nonSysDba = tb03Rows.filter((g) => g.trim().toUpperCase() !== "SYS");
        const tb03: CheckResult =
          nonSysDba.length > 0
            ? { id: "TB-03", status: "fail", evidence: `비-SYS 계정에 DBA 권한 부여됨: ${nonSysDba.join(", ")}` }
            : { id: "TB-03", status: "pass", evidence: "DBA 권한은 SYS에만 부여됨" };

        // TB-04: ANY 권한 부여 존재 여부.
        const tb04: CheckResult =
          tb04Rows.length > 0
            ? { id: "TB-04", status: "fail", evidence: `ANY 권한 부여 존재: ${tb04Rows.join(", ")}` }
            : { id: "TB-04", status: "pass", evidence: "ANY 권한 부여 없음" };

        // TB-05: FAILED_LOGIN_ATTEMPTS.
        const failedLoginAttempts = profileLimit(profRows, "FAILED_LOGIN_ATTEMPTS");
        const tb05: CheckResult =
          failedLoginAttempts === null
            ? { id: "TB-05", status: "review", evidence: "FAILED_LOGIN_ATTEMPTS 값을 확인할 수 없음" }
            : failedLoginAttempts.toUpperCase() === "UNLIMITED"
              ? { id: "TB-05", status: "fail", evidence: "FAILED_LOGIN_ATTEMPTS=UNLIMITED(무제한)" }
              : { id: "TB-05", status: "pass", evidence: `FAILED_LOGIN_ATTEMPTS=${failedLoginAttempts}` };

        // TB-06: PASSWORD_LOCK_TIME(값 표시만, null이면 review).
        const passwordLockTime = profileLimit(profRows, "PASSWORD_LOCK_TIME");
        const tb06: CheckResult =
          passwordLockTime === null
            ? { id: "TB-06", status: "review", evidence: "PASSWORD_LOCK_TIME 값을 확인할 수 없음" }
            : { id: "TB-06", status: "pass", evidence: `PASSWORD_LOCK_TIME=${passwordLockTime}` };

        // TB-07: PASSWORD_LIFE_TIME.
        const passwordLifeTime = profileLimit(profRows, "PASSWORD_LIFE_TIME");
        const tb07: CheckResult =
          passwordLifeTime === null
            ? { id: "TB-07", status: "review", evidence: "PASSWORD_LIFE_TIME 값을 확인할 수 없음" }
            : passwordLifeTime.toUpperCase() === "UNLIMITED"
              ? { id: "TB-07", status: "fail", evidence: "PASSWORD_LIFE_TIME=UNLIMITED(무제한)" }
              : { id: "TB-07", status: "pass", evidence: `PASSWORD_LIFE_TIME=${passwordLifeTime}` };

        // TB-08: PASSWORD_REUSE_TIME/MAX 둘 다 UNLIMITED(또는 없음)면 fail.
        const reuseTime = profileLimit(profRows, "PASSWORD_REUSE_TIME");
        const reuseMax = profileLimit(profRows, "PASSWORD_REUSE_MAX");
        const isUnlimitedOrAbsent = (v: string | null) => v === null || v.toUpperCase() === "UNLIMITED";
        const reuseEvidence = `PASSWORD_REUSE_TIME=${reuseTime ?? "미설정"}, PASSWORD_REUSE_MAX=${reuseMax ?? "미설정"}`;
        const tb08: CheckResult =
          isUnlimitedOrAbsent(reuseTime) && isUnlimitedOrAbsent(reuseMax)
            ? { id: "TB-08", status: "fail", evidence: reuseEvidence }
            : { id: "TB-08", status: "pass", evidence: reuseEvidence };

        // TB-09: PASSWORD_VERIFY_FUNCTION이 NULL/빈값이면 fail.
        const verifyFn = profileLimit(profRows, "PASSWORD_VERIFY_FUNCTION");
        const tb09: CheckResult =
          !verifyFn || verifyFn.toUpperCase() === "NULL"
            ? { id: "TB-09", status: "fail", evidence: `PASSWORD_VERIFY_FUNCTION=${verifyFn ?? "미설정"}` }
            : { id: "TB-09", status: "pass", evidence: `PASSWORD_VERIFY_FUNCTION=${verifyFn}` };

        // TB-10: SESSIONS_PER_USER이 UNLIMITED면 review, 숫자면 pass, 확인 불가면 review.
        const sessionsPerUser = profileLimit(profRows, "SESSIONS_PER_USER");
        const tb10: CheckResult =
          sessionsPerUser === null
            ? { id: "TB-10", status: "review", evidence: "SESSIONS_PER_USER 값을 확인할 수 없음" }
            : sessionsPerUser.toUpperCase() === "UNLIMITED"
              ? { id: "TB-10", status: "review", evidence: "SESSIONS_PER_USER=UNLIMITED(무제한, 검토 필요)" }
              : { id: "TB-10", status: "pass", evidence: `SESSIONS_PER_USER=${sessionsPerUser}` };

        // TB-11/12: v$parameter의 audit_trail / audit_sys_operations.
        const findParam = (name: string): string | null => {
          const row = tb11Rows.find((r) => r.split("|")[0]?.trim().toLowerCase() === name);
          if (!row) return null;
          return (row.split("|")[1] ?? "").trim();
        };
        const auditTrail = findParam("audit_trail");
        const tb11: CheckResult =
          auditTrail === null
            ? { id: "TB-11", status: "review", evidence: "audit_trail 값을 확인할 수 없음" }
            : auditTrail.toUpperCase() === "NONE"
              ? { id: "TB-11", status: "fail", evidence: `audit_trail=${auditTrail}` }
              : { id: "TB-11", status: "pass", evidence: `audit_trail=${auditTrail}` };

        const auditSysOperations = findParam("audit_sys_operations");
        const tb12: CheckResult =
          auditSysOperations === null
            ? { id: "TB-12", status: "review", evidence: "audit_sys_operations 값을 확인할 수 없음" }
            : auditSysOperations.toUpperCase() === "Y"
              ? { id: "TB-12", status: "pass", evidence: `audit_sys_operations=${auditSysOperations}` }
              : { id: "TB-12", status: "review", evidence: `audit_sys_operations=${auditSysOperations}(검토 필요)` };

        db = {
          "TB-01": tb01,
          "TB-03": tb03,
          "TB-04": tb04,
          "TB-05": tb05,
          "TB-06": tb06,
          "TB-07": tb07,
          "TB-08": tb08,
          "TB-09": tb09,
          "TB-10": tb10,
          "TB-11": tb11,
          "TB-12": tb12,
        };
      }
    }

    return [
      db["TB-01"],
      tb02,
      db["TB-03"],
      db["TB-04"],
      db["TB-05"],
      db["TB-06"],
      db["TB-07"],
      db["TB-08"],
      db["TB-09"],
      db["TB-10"],
      db["TB-11"],
      db["TB-12"],
      tb13,
      tb14,
    ];
  },
};
