# 티베로 DB 로그인 쿼리 점검 TB-01~12 (플랜 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랜 1의 벤더 입력값 프레임워크 위에, 티베로에 tbSQL로 로그인해 시스템 뷰·파라미터를 조회하는 DB 점검 TB-01~TB-12(계정·프로파일·감사)를 추가한다.

**Architecture:** 티베로 팩에 tbSQL 인증 쿼리 evidence 태스크 2개를 추가한다. 사용자 입력(계정/비밀번호/SID)은 Ansible `quote` 필터로 셸 인용하고, **비밀번호는 argv가 아닌 tbSQL의 `/nolog`+`CONN`(stdin)으로 전달**해 프로세스 목록 노출을 막는다. evaluate가 쿼리 출력을 섹션 마커로 분할해 TB-01~12를 판정하며, DB 인증 실패 시 DB-쿼리 의존 항목은 review 처리한다.

**Tech Stack:** TypeScript strict / Vitest / ansible `ansible.builtin.raw` / tbSQL(티베로 CLI).

## Global Constraints

- **명령 주입 방지(플랜 1 필수 패턴 유지)**: 모든 사용자 입력(`tibero_db_user`/`tibero_db_pass`/`tibero_tbsid`)은 Ansible `| quote` 필터로만 raw 셸에 넣는다. `sh -c '...'` 래퍼로 감싸 quote 출력을 중첩시키지 않는다.
- **비밀번호 argv 노출 금지**: `tbsql user/pass@sid`처럼 비밀번호를 명령 인자에 두지 않는다. `tbsql -s /nolog`로 시작해 `CONN {user}/{pass}@{sid}`를 **stdin**으로 보낸다(대상 서버 `ps`에 비밀번호 미노출). 비밀번호는 여전히 extra-vars 임시파일 채널로만 들어온다.
- 새 evidence는 **DB 로그인 쿼리만**(플랜 2 범위). 파일기반 TB-13/TB-14는 그대로 둔다.
- DB 인증 실패(잘못된 계정/도달 불가)면 DB-쿼리 의존 항목(TB-01~12)은 `review` + "DB 인증 실패". 필수 입력(계정/비밀번호/SID) 미제공도 `review` + "사전 입력값 미제공".
- 카탈로그 프레임워크 `tmax`, 항목 접두 TB. 모든 카탈로그 항목은 mitigation 필수(기존 불변식).
- tbSQL 출력 형식은 실 인스턴스 없이 확정 불가 → **파싱은 픽스처 기반 테스트로 검증**, 실 티베로 E2E는 후속. 출력은 `SET HEADING OFF FEEDBACK OFF PAGESIZE 0`로 정규화하고 섹션 마커(`###TBnn`)로 구분한다.
- 실제 코드로 테스트(모의 최소화). 각 태스크는 독립 검증 가능한 산출물로 끝낸다.

---

### Task 1: 카탈로그 TB-01~12 항목 + mitigation + itemIds 확장

**Files:**
- Modify: `src/lib/catalog/data/tmax/tibero.json` (TB-01~12 추가)
- Modify: `src/lib/catalog/data/mitigations.json` (TB-01~12 조치 가이드)
- Modify: `src/lib/packs/dbTibero.ts` (`itemIds`에 TB-01~12 추가 — evaluate는 Task 3)

**Interfaces:**
- Produces: 카탈로그에 TB-01~12(framework tmax, category db), 각 항목 mitigation, 팩 itemIds 14종.

- [ ] **Step 1: 카탈로그 데이터 추가**

`src/lib/catalog/data/tmax/tibero.json`의 배열에 TB-13/TB-14 앞에 아래 12개를 추가(KISA/CIS 데이터 파일 형식 — category/frameworkId 없이 id/title/severity/automationStatus/source):

```json
  { "id": "TB-01", "title": "기본 계정 잠금·비밀번호 변경", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 사용자 관리" } },
  { "id": "TB-02", "title": "SYS 기본 비밀번호 사용 여부", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 사용자 관리" } },
  { "id": "TB-03", "title": "불필요한 DBA 롤 부여 계정", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 권한과 롤" } },
  { "id": "TB-04", "title": "과도한 시스템 특권 부여", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 권한과 롤" } },
  { "id": "TB-05", "title": "로그인 실패 잠금(FAILED_LOGIN_ATTEMPTS)", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 프로파일" } },
  { "id": "TB-06", "title": "계정 잠금 기간(PASSWORD_LOCK_TIME)", "severity": "Low", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 프로파일" } },
  { "id": "TB-07", "title": "비밀번호 사용 기간(PASSWORD_LIFE_TIME)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 프로파일" } },
  { "id": "TB-08", "title": "비밀번호 재사용 제한(PASSWORD_REUSE_TIME/MAX)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 프로파일" } },
  { "id": "TB-09", "title": "비밀번호 복잡도 함수(PASSWORD_VERIFY_FUNCTION)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 프로파일" } },
  { "id": "TB-10", "title": "세션 수 제한(SESSIONS_PER_USER)", "severity": "Low", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 프로파일" } },
  { "id": "TB-11", "title": "감사 활성화(AUDIT_TRAIL)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 감사" } },
  { "id": "TB-12", "title": "SYS 감사(AUDIT_SYS_OPERATIONS)", "severity": "Low", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "Tibero 관리자 가이드 · 감사" } },
```

- [ ] **Step 2: mitigation 추가**

`src/lib/catalog/data/mitigations.json`에 TB-01~12 각 항목의 `{ "risk": "...", "fix": "...", "example": "..." }`를 추가한다. 기존 TB-13/TB-14, DB-*, ORA-* 항목의 구조(risk 1~2문장, fix 번호 단계, example 명령)를 그대로 따르고, 아래 내용으로 작성한다(각 항목별):

- TB-01 risk: "기본 계정이 열린 채 방치되면 알려진 계정명으로 침입에 악용된다." fix: "미사용 기본 계정을 ACCOUNT LOCK하고, 사용하는 계정은 비밀번호를 변경한다." example: "ALTER USER OUTLN ACCOUNT LOCK;"
- TB-02 risk: "SYS가 기본 비밀번호 tibero를 그대로 쓰면 누구나 최고 권한으로 접속할 수 있다." fix: "SYS 비밀번호를 강한 값으로 즉시 변경한다." example: "ALTER USER SYS IDENTIFIED BY <강한비밀번호>;"
- TB-03 risk: "불필요한 계정에 DBA 롤이 있으면 권한 오남용·확대 위험이 크다." fix: "업무상 불필요한 계정에서 DBA 롤을 회수한다." example: "REVOKE DBA FROM <계정>;"
- TB-04 risk: "ANY류 시스템 특권은 다른 스키마 객체까지 침해할 수 있어 위험하다." fix: "필요 최소 권한만 남기고 과도한 시스템 특권을 회수한다." example: "REVOKE SELECT ANY TABLE FROM <계정>;"
- TB-05 risk: "로그인 실패 잠금이 없으면 무차별 대입 공격을 막지 못한다." fix: "프로파일의 FAILED_LOGIN_ATTEMPTS를 5 이하로 설정한다." example: "ALTER PROFILE DEFAULT LIMIT FAILED_LOGIN_ATTEMPTS 5;"
- TB-06 risk: "계정 잠금 기간이 너무 짧으면 잠금 효과가 약해진다." fix: "PASSWORD_LOCK_TIME을 조직 정책에 맞게 설정한다." example: "ALTER PROFILE DEFAULT LIMIT PASSWORD_LOCK_TIME 1;"
- TB-07 risk: "비밀번호 사용 기간이 무제한이면 유출된 비밀번호가 계속 유효하다." fix: "PASSWORD_LIFE_TIME을 90일 이하로 설정한다." example: "ALTER PROFILE DEFAULT LIMIT PASSWORD_LIFE_TIME 90;"
- TB-08 risk: "비밀번호 재사용 제한이 없으면 사용자가 옛 비밀번호를 반복 사용한다." fix: "PASSWORD_REUSE_TIME 또는 PASSWORD_REUSE_MAX를 설정한다." example: "ALTER PROFILE DEFAULT LIMIT PASSWORD_REUSE_MAX 3;"
- TB-09 risk: "비밀번호 복잡도 검증이 없으면 취약한 비밀번호가 허용된다." fix: "PASSWORD_VERIFY_FUNCTION에 VERIFY_FUNCTION 또는 VERIFY_FUNCTION2를 지정한다." example: "ALTER PROFILE DEFAULT LIMIT PASSWORD_VERIFY_FUNCTION VERIFY_FUNCTION2;"
- TB-10 risk: "사용자당 세션 수 제한이 없으면 자원 고갈·오남용에 취약하다." fix: "SESSIONS_PER_USER를 업무 기준으로 제한한다." example: "ALTER PROFILE DEFAULT LIMIT SESSIONS_PER_USER 10;"
- TB-11 risk: "감사가 꺼져 있으면 침해·오남용 추적이 불가능하다." fix: "AUDIT_TRAIL을 DB/DB_EXTENDED/OS 중 하나로 설정한다." example: "AUDIT_TRAIL=DB (.tip에 설정 후 재기동)"
- TB-12 risk: "SYS 작업 감사가 꺼져 있으면 최고 권한 활동이 기록되지 않는다." fix: "AUDIT_SYS_OPERATIONS를 Y로 설정한다." example: "AUDIT_SYS_OPERATIONS=Y (.tip에 설정 후 재기동)"

- [ ] **Step 3: 팩 itemIds 확장**

`src/lib/packs/dbTibero.ts`의 `itemIds`를 `["TB-01","TB-02","TB-03","TB-04","TB-05","TB-06","TB-07","TB-08","TB-09","TB-10","TB-11","TB-12","TB-13","TB-14"]`로 변경. (evaluate는 Task 3에서 TB-01~12를 반환하도록 확장하므로, 이 태스크에서는 itemIds만 확장하되 evaluate가 아직 TB-01~12를 반환하지 않으면 카탈로그-팩 정합성 테스트가 실패할 수 있다 — 그런 테스트가 있으면 Task 3 완료 시 통과한다. 이 태스크 단독으로 카탈로그 count 테스트(+12)만 갱신하고, itemIds-vs-evaluate 정합 검증은 Task 3 이후로 둔다.)

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 카탈로그 count 테스트(있으면 db +12, 총 +12)와 mitigation 커버리지 테스트가 통과하도록 기대값 갱신. itemIds-evaluate 정합 테스트가 실패하면 Task 3에서 해소됨을 확인(이 태스크 커밋 시점엔 그 테스트를 잠시 건너뛰지 말고, 정합 테스트가 별도 존재하는지 먼저 확인 — 없으면 그대로 통과).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/catalog/data/tmax/tibero.json src/lib/catalog/data/mitigations.json src/lib/packs/dbTibero.ts
git commit -m "feat: 티베로 DB 점검 TB-01~12 카탈로그·mitigation·itemIds 추가"
```

---

### Task 2: tbSQL 인증 쿼리 evidence 태스크 (안전 접속)

**Files:**
- Modify: `src/lib/packs/dbTibero.ts` (EVIDENCE에 tbSQL 태스크 2개 추가)

**Interfaces:**
- Produces: evidence 태스크 `TB-DB: tibero sys default login`(TB-02), `TB-DB: tibero queries`(TB-01/03~12). evaluate(Task 3)가 이 두 stdout을 파싱.

- [ ] **Step 1: 안전 접속 evidence 추가**

`src/lib/packs/dbTibero.ts`의 `EVIDENCE` 배열에 아래 두 태스크를 추가한다. **비밀번호는 stdin(CONN)으로만, 사용자 입력은 `| quote`로만** 들어간다.

```ts
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
```

그리고 `EVIDENCE` 배열에 `SYS_DEFAULT_LOGIN`, `DB_QUERIES`를 기존 TB-13/TB-14 태스크와 함께 넣는다.

주의: `v$parameter`의 `$`는 셸 확장을 막기 위해 `v\$parameter`로 이스케이프(위 코드에 반영됨). `%ANY%`의 `%`는 printf 포맷 충돌을 피하려 `%%`로 이스케이프(반영됨).

- [ ] **Step 2: 구조 회귀 테스트(주입 방지 유지)**

`src/lib/packs/dbTibero.test.ts`에 추가: 두 tbSQL evidence의 raw가 (a) `{{ tibero_db_user | quote }}`/`{{ tibero_db_pass | quote }}`/`{{ tibero_tbsid | quote }}`를 포함하고, (b) 비밀번호를 `tbsql ...@...` argv 형태로 직접 넣지 않으며(정규식으로 `tbsql[^\n]*\$p` 형태의 argv 삽입이 없는지), (c) `CONN %s/%s@%s`가 stdin(printf) 경로에 있는지 확인.

```typescript
it("tbSQL evidence quotes user inputs and passes password via stdin CONN, not argv (#injection/#ps)", () => {
  const q = tiberoPack.evidenceTasks.find((t) => t.name === "TB-DB: tibero queries")!;
  expect(q.raw).toContain("{{ tibero_db_pass | quote }}");
  expect(q.raw).toContain("{{ tibero_tbsid | quote }}");
  expect(q.raw).toContain("CONN %s/%s@%s"); // stdin 경로
  // 비밀번호가 tbsql argv에 직접 붙지 않음: tbsql 호출은 -s /nolog 뿐
  expect(q.raw).toMatch(/tbsql -s \/nolog/);
  expect(q.raw).not.toMatch(/tbsql[^\n]*\$p/); // argv에 비번 변수 없음
});
```

- [ ] **Step 3: 검증**

Run: `npx vitest run src/lib/packs/dbTibero.test.ts && npx tsc --noEmit && npx eslint src/lib/packs/dbTibero.ts src/lib/packs/dbTibero.test.ts`
Expected: 구조 테스트 PASS(evaluate는 아직 TB-01~12 미반영이라 관련 판정 테스트는 Task 3), 타입·린트 클린.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/packs/dbTibero.ts src/lib/packs/dbTibero.test.ts
git commit -m "feat: 티베로 tbSQL 인증 쿼리 evidence(비번 stdin·입력 quote) 추가"
```

---

### Task 3: evaluate — TB-01~12 판정 + 인증 실패 review

**Files:**
- Modify: `src/lib/packs/dbTibero.ts` (evaluate 확장 + 파싱 헬퍼)
- Modify: `src/lib/packs/dbTibero.test.ts` (픽스처 기반 판정 테스트)

**Interfaces:**
- Consumes: Task 2의 두 evidence stdout, `ctx.inputsProvided`.
- Produces: evaluate가 TB-01~14 14개 CheckResult 반환.

- [ ] **Step 1: 실패 테스트 작성 (픽스처)**

`src/lib/packs/dbTibero.test.ts`에 추가. 픽스처는 §Global Constraints의 정규화 출력(마커 + `값|값`) 형식을 가정한다.

```typescript
function dbTasks(login: string, queries: string) {
  return [
    { taskName: "TB-DB: tibero sys default login", stdout: login },
    { taskName: "TB-DB: tibero queries", stdout: queries },
  ];
}
const PROVIDED = new Set(["tibero_home", "tibero_tbsid", "tibero_db_user", "tibero_db_pass"]);

describe("tiberoPack DB checks (TB-01~12)", () => {
  it("reviews all DB items when credentials are missing", () => {
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("", ""), inputsProvided: new Set(["tibero_home","tibero_tbsid"]) });
    for (const id of ["TB-01","TB-03","TB-05","TB-11"]) expect(r.find((x) => x.id === id)!.status).toBe("review");
  });

  it("reviews DB items when tbSQL connection failed (no __CONN_OK__)", () => {
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", "TBR-12345: login denied"), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-05")!.status).toBe("review");
    expect(r.find((x) => x.id === "TB-05")!.evidence).toContain("DB 인증 실패");
  });

  it("TB-02 fails when SYS default password login succeeds", () => {
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW__", "__CONN_OK__\n###TB01\n###TB03\n###TB04\n###TBPROF\n###TB11\n"), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-02")!.status).toBe("fail");
  });

  it("TB-05 fails when FAILED_LOGIN_ATTEMPTS is UNLIMITED (default profile)", () => {
    const queries = "__CONN_OK__\n###TB01\nSYS|OPEN\n###TB03\n###TB04\n###TBPROF\nDEFAULT|FAILED_LOGIN_ATTEMPTS|UNLIMITED\nDEFAULT|PASSWORD_LIFE_TIME|90\n###TB11\naudit_trail|DB\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-05")!.status).toBe("fail");
    expect(r.find((x) => x.id === "TB-07")!.status).toBe("pass"); // 90일 → 양호
  });

  it("TB-11 fails when audit_trail is NONE", () => {
    const queries = "__CONN_OK__\n###TB01\n###TB03\n###TB04\n###TBPROF\nDEFAULT|FAILED_LOGIN_ATTEMPTS|5\n###TB11\naudit_trail|NONE\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-11")!.status).toBe("fail");
    expect(r.find((x) => x.id === "TB-05")!.status).toBe("pass"); // 5 → 양호
  });

  it("TB-03 fails when a non-SYS account has DBA role", () => {
    const queries = "__CONN_OK__\n###TB01\n###TB03\nAPPUSER\n###TB04\n###TBPROF\n###TB11\n";
    const r = tiberoPack.evaluate({ findings: null, tasks: dbTasks("__SYS_DEFAULT_PW_ABSENT__", queries), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "TB-03")!.status).toBe("fail");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/packs/dbTibero.test.ts`
Expected: FAIL — evaluate가 아직 TB-01~12를 반환하지 않음.

- [ ] **Step 3: evaluate 확장 + 파싱 헬퍼**

`src/lib/packs/dbTibero.ts`에 파싱 헬퍼를 추가하고 evaluate가 TB-01~12 결과를 함께 반환하도록 확장한다. 정규화 출력 파싱 규칙:

```ts
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
```

evaluate 본문에 아래 로직을 추가한다(기존 TB-13/TB-14 반환 앞뒤로 병합해 14개 반환):

- 접속/입력 상태 판정:
  - `dbInputsProvided = inputsProvided.has("tibero_db_user") && has("tibero_db_pass") && has("tibero_tbsid")`
  - `queriesOut = taskStdout("TB-DB: tibero queries")`; `connOk = queriesOut.includes("__CONN_OK__")`
  - DB 항목 공통 전제: `!dbInputsProvided` → 모든 TB-01/03~12 `review`("사전 입력값 미제공(DB 계정/비밀번호/인스턴스)"). 그다음 `!connOk` → 모든 TB-01/03~12 `review`("DB 인증 실패").
- TB-02: `sysOut = taskStdout("TB-DB: tibero sys default login")`. `sysOut.includes("__SYS_DEFAULT_PW__")` → `fail`(기본비번 사용), `__SYS_DEFAULT_PW_ABSENT__` → `pass`, 그 외 → `review`. (TB-02는 dbInputsProvided/connOk와 독립 — 자체 로그인 시도 결과로 판정하되, sysOut이 비면 review.)
- 접속 OK일 때 섹션 파싱 후:
  - **TB-01**: TB01 섹션에서 `계정|account_status`. 기본계정(SYS·SYSCAT·SYSGIS·OUTLN·SYSBACKUP·TIBERO·TIBERO1·LBACSYS) 중 status가 OPEN인 게 있으면 `fail`(미사용 기본계정 OPEN 가능성), 전부 LOCK/EXPIRED면 `pass`. (보수적으로: 기본계정이 하나라도 OPEN이면 fail — evidence에 해당 계정 나열.)
  - **TB-03**: TB03 섹션(grantee 목록)에서 `SYS`를 제외한 값이 하나라도 있으면 `fail`(비-SYS DBA 부여), 없으면 `pass`.
  - **TB-04**: TB04 섹션이 비어있지 않으면 `fail`(ANY 특권 부여 존재), 비면 `pass`.
  - **TB-05**: `profileLimit(TBPROF,'FAILED_LOGIN_ATTEMPTS')`가 `UNLIMITED`(대문자 무시)면 `fail`, 숫자면 `pass`, null이면 `review`.
  - **TB-06**: `PASSWORD_LOCK_TIME`이 null이면 `review`, 그 외 `pass`(값 표시만).
  - **TB-07**: `PASSWORD_LIFE_TIME`이 `UNLIMITED`면 `fail`, 숫자면 `pass`, null이면 `review`.
  - **TB-08**: `PASSWORD_REUSE_TIME`·`PASSWORD_REUSE_MAX` 둘 다 `UNLIMITED`(또는 없음)면 `fail`, 하나라도 제한 있으면 `pass`.
  - **TB-09**: `PASSWORD_VERIFY_FUNCTION`이 `NULL`(문자열)/빈값이면 `fail`, 지정돼 있으면 `pass`.
  - **TB-10**: `SESSIONS_PER_USER`가 `UNLIMITED`면 `review`(검토), 숫자면 `pass`.
  - **TB-11**: TB11 섹션에서 `audit_trail` 값이 `NONE`(대문자 무시)면 `fail`, 그 외 값 있으면 `pass`, 없으면 `review`.
  - **TB-12**: `audit_sys_operations`가 `N`이면 `review`(검토), `Y`면 `pass`, 없으면 `review`.

각 항목의 evidence 문자열에 근거(파싱된 값)를 담는다. 반환 배열은 TB-01,02,03,...,12,13,14 순.

- [ ] **Step 4: 테스트 통과 확인 + 전체 검증**

Run: `npx vitest run src/lib/packs/dbTibero.test.ts && npx vitest run && npx tsc --noEmit && npx eslint src/lib/packs/dbTibero.ts src/lib/packs/dbTibero.test.ts && npm run build`
Expected: 신규 판정 테스트 PASS, 기존 TB-13/14 테스트 회귀 없음, 전체 통과, 타입·린트·빌드 클린. 카탈로그 itemIds(14) ↔ evaluate 반환(14) 정합.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/packs/dbTibero.ts src/lib/packs/dbTibero.test.ts
git commit -m "feat: 티베로 evaluate TB-01~12 판정(프로파일·계정·감사) + DB 인증 실패 review"
```

---

### Task 4: 실 검증 (수동) — tbSQL 출력 형식 확인

코드 검증은 Task 1~3 픽스처 테스트로 끝났다. tbSQL 실제 출력 형식(헤딩/여백/에러 코드)은 실 티베로 인스턴스에서만 확정된다. 이 태스크는 실 인스턴스 확보 시 수행한다(자동 아님).

- [ ] **Step 1:** 실 티베로에 DBA 계정으로 자산 등록(입력 5종) 후 점검 실행.
- [ ] **Step 2:** `TB-DB: tibero queries` 원시 출력을 확인해 `__CONN_OK__`·`###TBnn` 마커와 `값|값` 라인이 기대대로 나오는지 검증. 다르면 `splitSections`/쿼리 SET 옵션을 실 형식에 맞춰 조정(파싱 계약만 수정, 판정 로직 유지).
- [ ] **Step 3:** DEFAULT 프로파일 기본값(FAILED_LOGIN_ATTEMPTS=UNLIMITED 등)에서 TB-05/07이 fail로 잡히는지 확인.
- [ ] **Step 4:** 잘못된 비밀번호로 등록 시 TB-01~12가 "DB 인증 실패" review로 나오는지 확인.

---

## Self-Review

**Spec coverage (스펙 §7-3 → 태스크):**
- TB-01(기본계정)·TB-03(DBA롤)·TB-04(ANY특권) → Task 2 쿼리 + Task 3 판정. ✓
- TB-02(SYS 기본비번) → Task 2 별도 로그인 시도 + Task 3. ✓
- TB-05~10(프로파일, DBA_PROFILES 한 쿼리) → Task 2 TBPROF 섹션 + Task 3. ✓
- TB-11/12(감사 파라미터) → Task 2 v$parameter + Task 3. ✓
- 카탈로그·mitigation(모든 항목 필수) → Task 1. ✓
- DB 인증 실패/입력 누락 → review → Task 3. ✓
- 명령주입 방지(quote)·비번 argv 미노출(stdin CONN) → Task 2 + 구조 회귀 테스트. ✓
- 실 형식 검증 → Task 4(수동). ✓

**Placeholder scan:** tbSQL 출력 형식은 실 인스턴스 의존이라 Task 4로 명시 분리(플레이스홀더 아님 — 파싱은 픽스처로 완결 검증, 실형식 조정은 계약 수정). 판정 기준·쿼리·파싱은 모두 구체 코드로 명시.

**Type consistency:** evidence 태스크명(`TB-DB: tibero sys default login`, `TB-DB: tibero queries`)이 Task 2 정의와 Task 3 파싱에서 동일. 섹션 마커(`###TB01/TB03/TB04/TBPROF/TB11`)가 쿼리(Task 2)와 splitSections(Task 3)에서 동일. itemIds 14종(Task 1) ↔ evaluate 반환 14종(Task 3) 일치. 입력 변수명 `tibero_*`가 프레임워크(플랜1)와 동일.
