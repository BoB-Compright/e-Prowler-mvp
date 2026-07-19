# JEUS·WebtoB 설정파일 기반 점검 (플랜 A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 벤더 사전 입력값 프레임워크 위에 JEUS(WAS)·WebtoB(WEB) 벤더 팩을 추가하되, **설정파일 기반 점검**(JEUS `accounts.xml`+`domain.xml`+`security.key`, WebtoB `http.m`)만 구현한다. 관리자 콘솔 로그인 항목(JE-14, WT-10)은 플랜 B(후속).

**Architecture:** 티베로 파일기반 팩(`dbTibero.ts`의 TB-13/14)과 동일한 패턴 — 경로 입력값(secret 없음)을 Ansible `| quote`로 안전 삽입해 SSH로 설정파일을 읽고, 정규식 파싱으로 판정한다. secret·콘솔 로그인이 없어 ps 노출 이슈가 없다. fail-closed(입력누락·파일없음→review).

**Tech Stack:** TypeScript strict / Vitest / ansible `ansible.builtin.raw` / (JEUS: XML domain.xml/accounts.xml, WebtoB: http.m 텍스트).

## Global Constraints

- 이 플랜은 **설정파일 기반만**. 콘솔(jeusadmin/wsadmin) 로그인 항목·admin 계정/비밀번호(secret) 입력은 범위 밖(플랜 B). 따라서 이 플랜의 입력값은 **경로/텍스트뿐, secret 없음**.
- 명령 주입 방지: 사용자 입력(`jeus_home`/`jeus_domain`/`webtob_dir`)은 Ansible `| quote` 필터로만 raw 셸에 삽입. `sh -c '...'` 래퍼로 quote 출력을 감싸지 않는다(티베로 패턴).
- 카탈로그 프레임워크 `tmax`, 항목 ID 접두 JE(JEUS/category `was`)·WT(WebtoB/category `web`). 모든 카탈로그 항목은 mitigation 필수(기존 불변식).
- 파일 형식(domain.xml/http.m 정확한 요소·절 이름)은 실 인스턴스 없이 확정 불가 → **파싱은 픽스처 테스트로 검증**, 실 JEUS/WebtoB E2E는 후속. 명확한 증거 없으면 review(fail-closed) — 취약/미지 상태를 pass로 오판하지 않는다.
- 실제 코드로 테스트(모의 최소화). 각 태스크는 독립 검증 가능한 산출물로 끝낸다.
- 카탈로그 count·mitigation 커버리지 테스트가 있으면 새 항목 수만큼 기대값을 갱신한다.

---

### Task 1: 카탈로그 JE-01~13 · WT-01~09 + mitigation + 벤더 등록

**Files:**
- Create: `src/lib/catalog/data/tmax/jeus.json`
- Create: `src/lib/catalog/data/tmax/webtob.json`
- Modify: `src/lib/catalog/index.ts` (로더 등록)
- Modify: `src/lib/catalog/data/mitigations.json` (JE/WT 항목)
- Modify: `src/lib/assets/categories.ts` (WAS→JEUS, WEB→WebtoB)

**Interfaces:**
- Produces: 카탈로그에 JE-01~13(category `was`)·WT-01~09(category `web`), framework `tmax`; mitigation; 벤더 목록.

- [ ] **Step 1: JEUS 카탈로그 데이터**

Create `src/lib/catalog/data/tmax/jeus.json` (KISA/CIS 데이터 파일 형식 — id/title/severity/automationStatus/source):

```json
[
  { "id": "JE-01", "title": "기본 관리자 계정(administrator) 사용", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 보안 관리 · 계정" } },
  { "id": "JE-02", "title": "관리자 비밀번호 평문 저장", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 보안 관리 · 비밀번호 암호화" } },
  { "id": "JE-03", "title": "약한 비밀번호 암호화 알고리즘", "severity": "Low", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 보안 관리 · 비밀번호 암호화" } },
  { "id": "JE-04", "title": "계정파일(accounts.xml) 권한", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 보안 관리 · 설정파일 보호" } },
  { "id": "JE-05", "title": "보안 키파일(security.key) 권한", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 보안 관리 · 설정파일 보호" } },
  { "id": "JE-06", "title": "세션 타임아웃 설정", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 세션" } },
  { "id": "JE-07", "title": "세션 쿠키 보안속성(secure/http-only)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 세션" } },
  { "id": "JE-08", "title": "SSL/TLS 리스너 사용", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 리스너" } },
  { "id": "JE-09", "title": "데이터소스 DB 비밀번호 암호화", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 데이터소스" } },
  { "id": "JE-10", "title": "불필요한 샘플/예제 앱 배포", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 배포" } },
  { "id": "JE-11", "title": "접근/감사 로그 활성화", "severity": "Low", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 로깅" } },
  { "id": "JE-12", "title": "관리 콘솔 접근 제어", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 관리" } },
  { "id": "JE-13", "title": "에러페이지/스택트레이스 노출", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "JEUS 도메인 설정 · 에러" } }
]
```

- [ ] **Step 2: WebtoB 카탈로그 데이터**

Create `src/lib/catalog/data/tmax/webtob.json`:

```json
[
  { "id": "WT-01", "title": "디렉터리 리스팅 비활성", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · Options" } },
  { "id": "WT-02", "title": "설정파일(http.m) 권한", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · 설정파일 보호" } },
  { "id": "WT-03", "title": "불필요한 HTTP 메서드 제한", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · Method" } },
  { "id": "WT-04", "title": "에러페이지/서버 정보 노출", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · ErrorDocument" } },
  { "id": "WT-05", "title": "SSL/TLS 사용", "severity": "High", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · SSL" } },
  { "id": "WT-06", "title": "접근 로그(Logging) 설정", "severity": "Low", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · Logging" } },
  { "id": "WT-07", "title": "요청 크기/타임아웃 제한(DoS 완화)", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · NODE" } },
  { "id": "WT-08", "title": "상위 경로/심볼릭 링크 접근 제한", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · 접근제어" } },
  { "id": "WT-09", "title": "관리(wsadmin) 접근 제어", "severity": "Medium", "automationStatus": "automated", "source": { "framework": "Tmax", "ref": "WebtoB 환경설정 · 관리" } }
]
```

- [ ] **Step 3: 로더 등록**

`src/lib/catalog/index.ts`: `import jeusData from "./data/tmax/jeus.json";`, `import webtobData from "./data/tmax/webtob.json";` 추가하고 `CATALOG_SOURCES`에 두 엔트리 추가:

```typescript
  { frameworkId: "tmax", category: "was", data: jeusData as RawItem[] },
  { frameworkId: "tmax", category: "web", data: webtobData as RawItem[] },
```

(기존 tibero 엔트리 `{ frameworkId: "tmax", category: "db", data: tiberoData }` 옆에.)

- [ ] **Step 4: mitigation 추가**

`src/lib/catalog/data/mitigations.json`에 JE-01~13·WT-01~09 각 `{ "risk": "...", "fix": "...", "example": "..." }`를 추가한다. 기존 TB-*/DB-* 항목 구조를 그대로 따르고, 아래 내용으로:

JEUS:
- JE-01 risk "기본 관리자 계정명은 널리 알려져 무차별 대입 표적이 된다." fix "administrator 대신 고유 관리자 계정을 만들고 기본 계정을 제거/변경한다." example "jeusadmin> add-user newadmin ...; delete-user administrator"
- JE-02 risk "관리자 비밀번호가 평문이면 파일 유출 시 즉시 탈취된다." fix "accounts.xml 비밀번호를 {AES} 등으로 암호화 저장한다." example "JEUS_HOME/bin/encryption 또는 jeusadmin set-password"
- JE-03 risk "DES 등 약한 알고리즘은 복호화 위험이 있다." fix "AES 또는 SEED로 재암호화한다." example "encryption -algorithm AES ..."
- JE-04 risk "비밀번호를 담은 accounts.xml에 타 사용자 접근이 가능하면 유출된다." fix "소유자만 읽도록 권한을 제한한다." example "chmod 600 accounts.xml"
- JE-05 risk "보안 키파일 노출 시 암호화가 무력화된다." fix "security.key를 소유자 전용으로 제한한다." example "chmod 600 security.key"
- JE-06 risk "세션 타임아웃이 길거나 없으면 세션 탈취 위험이 커진다." fix "session-config 타임아웃을 30분 이하로 설정한다." example "<session-config><timeout>30</timeout></session-config>"
- JE-07 risk "세션 쿠키에 secure/http-only가 없으면 탈취·XSS에 취약하다." fix "쿠키에 secure·http-only를 설정한다." example "cookie secure=true http-only=true"
- JE-08 risk "평문 리스너만 있으면 통신이 도청된다." fix "HTTPS/SSL 리스너를 구성한다." example "domain.xml listener에 ssl 설정 추가"
- JE-09 risk "데이터소스 DB 비밀번호가 평문이면 DB까지 탈취된다." fix "data-source password를 암호화 형식으로 저장한다." example "<password>{AES}...</password>"
- JE-10 risk "샘플/예제 앱은 알려진 취약점의 공격면이 된다." fix "examples/console 등 불필요 앱을 언디플로이한다." example "jeusadmin undeploy examples"
- JE-11 risk "접근/감사 로그가 없으면 침해 추적이 불가능하다." fix "access-log/logging을 활성화한다." example "domain.xml에 access-log 설정"
- JE-12 risk "관리 콘솔이 전체 개방이면 무단 관리 접근 위험이 있다." fix "관리 리스너를 허용 IP로 제한한다." example "관리 리스너 bind-address를 내부망으로 제한"
- JE-13 risk "에러페이지에 스택트레이스가 노출되면 내부 정보가 유출된다." fix "커스텀 에러페이지 사용, 스택트레이스 노출을 끈다." example "show-stacktrace=false, error-page 설정"

WebtoB:
- WT-01 risk "디렉터리 리스팅이 켜지면 파일 구조가 노출된다." fix "Options에서 INDEX를 제거한다." example "Options=\"...\" (INDEX 제외)"
- WT-02 risk "http.m에 타 사용자 쓰기 권한이 있으면 설정이 변조된다." fix "소유자만 쓰도록 권한을 제한한다." example "chmod 644 http.m"
- WT-03 risk "PUT/DELETE/TRACE 등은 파일 조작·XST에 악용된다." fix "필요한 메서드만 허용한다." example "Method=\"GET,POST,HEAD\""
- WT-04 risk "기본 에러페이지·서버 버전 노출은 정보 수집을 돕는다." fix "커스텀 ErrorDocument·서버 토큰 최소화." example "ErrorDocument 설정, 서버 헤더 최소화"
- WT-05 risk "평문 HTTP만 제공하면 통신이 도청된다." fix "SSL 절/443 리스너를 구성한다." example "http.m에 SSL 절 추가"
- WT-06 risk "접근 로그가 없으면 침해 추적이 어렵다." fix "Logging 절로 access log를 설정한다." example "*LOGGING 절 설정"
- WT-07 risk "요청 크기·타임아웃 제한이 없으면 DoS에 취약하다." fix "요청 본문·타임아웃 제한을 설정한다." example "NODE 절에 요청 제한 설정"
- WT-08 risk "상위 경로/심볼릭 링크 접근 허용은 경로 우회에 악용된다." fix "상위 경로·심볼릭 링크 접근을 제한한다." example "FollowSymLinks 비활성"
- WT-09 risk "관리 리스너가 개방되면 무단 관리 접근 위험이 있다." fix "wsadmin 접근을 허용 IP로 제한한다." example "Admin 리스너 접근 IP 제한"

- [ ] **Step 5: 벤더 등록**

`src/lib/assets/categories.ts`: `CATEGORY_VENDORS.WAS`에 `"JEUS"`, `CATEGORY_VENDORS.WEB`에 `"WebtoB"` 추가.

- [ ] **Step 6: 검증**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 카탈로그 count 테스트(있으면 was +13, web +9, 총 +22, tmax 프레임워크 +22)와 mitigation 커버리지 통과하도록 기대값 갱신. 빌드 성공. (팩 evaluate가 아직 없어 automated 표기는 Task 2/3에서 실증 — count·coverage만 이 태스크에서 확인.)

- [ ] **Step 7: 커밋**

```bash
git add src/lib/catalog/data/tmax/jeus.json src/lib/catalog/data/tmax/webtob.json src/lib/catalog/index.ts src/lib/catalog/data/mitigations.json src/lib/assets/categories.ts
git commit -m "feat: JEUS(JE-01~13)·WebtoB(WT-01~09) 카탈로그·mitigation·벤더 등록"
```

---

### Task 2: JEUS 팩 (파일기반 JE-01~13)

**Files:**
- Create: `src/lib/packs/wasJeus.ts`
- Test: `src/lib/packs/wasJeus.test.ts`
- Modify: `src/lib/packs/registry.ts` (`ALL_PACKS` 등록)

**Interfaces:**
- Consumes: `VendorPack`/`ScanInputSpec`/`EvalContext`/`PlaybookTask`(types), catalog(Task 1).
- Produces: `jeusPack: VendorPack` (category "WAS", vendors ["JEUS"], requiredInputs 2종, evidence, evaluate JE-01~13).

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/packs/wasJeus.test.ts` (티베로 테스트 패턴; `AnsibleTaskOutput` = {taskName, stdout}, MISSING="__MISSING__"). 대표 케이스:

```typescript
import { describe, expect, it } from "vitest";
import { jeusPack } from "./wasJeus";

const PROVIDED = new Set(["jeus_home", "jeus_domain"]);
function tasks(map: Record<string, string>) {
  return Object.entries(map).map(([taskName, stdout]) => ({ taskName, stdout }));
}

describe("jeusPack", () => {
  it("declares jeus_home(path) and jeus_domain(text), no secret", () => {
    const names = jeusPack.requiredInputs!.map((s) => s.name);
    expect(names).toEqual(["jeus_home", "jeus_domain"]);
    expect(jeusPack.requiredInputs!.every((s) => s.kind !== "secret")).toBe(true);
  });

  it("JE-02 fails when admin password is plaintext (not {algo})", () => {
    const acc = `<accounts><user><name>administrator</name><password>tibero123</password></user></accounts>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": acc }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-02")!.status).toBe("fail");
    expect(r.find((x) => x.id === "JE-01")!.status).toBe("fail"); // administrator 계정 존재
  });

  it("JE-02 passes when password is {AES}-encrypted", () => {
    const acc = `<accounts><user><name>svcadmin</name><password>{AES}i06wYRz3Gqun2sKtXHIq</password></user></accounts>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": acc }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-02")!.status).toBe("pass");
    expect(r.find((x) => x.id === "JE-01")!.status).toBe("pass"); // administrator 없음
  });

  it("JE-04 fails when accounts.xml is group/other accessible", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml perms": "jeus:jeus 644" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-04")!.status).toBe("fail");
  });

  it("reviews when required inputs missing", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: [], inputsProvided: new Set() });
    for (const id of ["JE-01","JE-02","JE-08"]) expect(r.find((x) => x.id === id)!.status).toBe("review");
  });

  it("reviews an item when its config file is missing", () => {
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: accounts.xml content": "__MISSING__" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-02")!.status).toBe("review");
  });

  it("JE-09 fails when a datasource password is plaintext in domain.xml", () => {
    const dom = `<domain><data-source><password>plainpw</password></data-source><session-config><timeout>30</timeout></session-config></domain>`;
    const r = jeusPack.evaluate({ findings: null, tasks: tasks({ "JE: domain.xml content": dom }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "JE-09")!.status).toBe("fail");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/packs/wasJeus.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 팩 구현**

Create `src/lib/packs/wasJeus.ts`. 구조:
- `REQUIRED_INPUTS`: `jeus_home`(path, required, placeholder `/home/jeus/jeus7`), `jeus_domain`(text, required, placeholder `jeus_domain`). **secret 없음.**
- 경로 조합(quote): `ACC = {{ (jeus_home + "/domains/" + jeus_domain + "/config/accounts.xml") | quote }}`,
  `DOM = {{ (jeus_home + "/domains/" + jeus_domain + "/config/domain.xml") | quote }}`,
  `KEY = {{ (jeus_home + "/domains/" + jeus_domain + "/config/security/security.key") | quote }}`.
- EVIDENCE(파일 읽기·stat, `sh -c` 래퍼 없이 `p=<quoted>` 후 `"$p"` — 티베로 TB-13/14 패턴):
  - `JE: accounts.xml content` (cat, 없으면 `__MISSING__`)
  - `JE: accounts.xml perms` (`stat -c "%U:%G %a"`)
  - `JE: domain.xml content` (cat)
  - `JE: security.key perms` (`stat -c "%U:%G %a"`)
- 파싱 헬퍼: `pwValues(xml)`=accounts.xml의 `<password>...</password>`(또는 `password="..."`) 값 목록,
  `hasAdmin(xml)`=`<name>administrator</name>` 존재, `xmlHas(xml, re)` 정규식 검사, `parseMode(perms)`·
  `isOverPermissive(mode)`(티베로에서 이미 있는 로직과 동일 개념 — 재구현), `isMissing(stdout)`.
- evaluate(ctx): `provided = inputsProvided.has("jeus_home") && has("jeus_domain")`. 각 항목:
  - `!provided` → 모두 review("사전 입력값 미제공").
  - 해당 증거가 `__MISSING__` → 그 증거에 의존하는 항목 review("설정파일을 찾을 수 없음").
  - JE-01: accounts.xml에 administrator 존재 → fail, 없으면 pass.
  - JE-02: accounts.xml password 중 `{`로 시작하지 않는(평문) 값이 하나라도 있으면 fail, 모두 `{...}`면 pass.
  - JE-03: password 중 `{DES}`/`{DESede}`/`{blowfish}`(대소문자 무시) 있으면 review, 아니면 pass.
  - JE-04: accounts.xml perms가 그룹/기타 접근(권한 3자리에서 group>0 또는 other>0의 읽기/쓰기)이면 fail. (계정파일은 소유자 전용 권장 → group/other 비트가 있으면 fail.)
  - JE-05: security.key perms 동일 기준.
  - JE-06: domain.xml `session-config` 안 `timeout` 값이 없거나 30 초과면 review, 30 이하면 pass.
  - JE-07: domain.xml 쿠키 설정에 `secure`·`http-only`(또는 `httponly`)가 둘 다 없으면 fail, 있으면 pass.
  - JE-08: domain.xml에 ssl 리스너(`ssl`/`https` 요소·속성) 있으면 pass, 없으면 fail.
  - JE-09: domain.xml `data-source` 안 `password` 중 `{`로 시작하지 않는 평문이 있으면 fail, 모두 암호화면 pass, data-source 없으면 review.
  - JE-10: domain.xml deployed에 `examples`/`console-sample` 등 샘플 앱 참조 있으면 review, 없으면 pass.
  - JE-11: domain.xml에 `access-log`/`logging` 설정 있으면 pass, 없으면 review.
  - JE-12: domain.xml 관리 리스너 bind가 `0.0.0.0`(전체 개방)이면 review, 아니면 pass.
  - JE-13: domain.xml에 `show-stacktrace` true 또는 커스텀 에러페이지 미설정이면 fail, 아니면 pass.
  - domain.xml 자체가 MISSING이면 JE-06~13 review.
- itemIds: JE-01~13. detect: `(): boolean => true`. 반환 순서 JE-01..JE-13.
- 각 결과 evidence에 근거를 담는다.

(주의: domain.xml/accounts.xml의 정확한 요소명은 draft다. 위 규칙은 픽스처 기준으로 구현하고, 실 인스턴스 검증에서 요소명이 다르면 파싱 정규식만 조정한다.)

- [ ] **Step 4: 레지스트리 등록**

`src/lib/packs/registry.ts`: `import { jeusPack } from "./wasJeus";` + `ALL_PACKS`에 추가. registry.test.ts의 pack-id 목록에 `"jeus"` 추가(정합 테스트 있으면).

- [ ] **Step 5: 검증**

Run: `npx vitest run src/lib/packs/wasJeus.test.ts && npx vitest run && npx tsc --noEmit && npx eslint src/lib/packs/wasJeus.ts src/lib/packs/wasJeus.test.ts src/lib/packs/registry.ts && npm run build`
Expected: 팩 테스트 PASS, 전체 통과, 타입·린트·빌드 클린. `getVendorInputSpecs("WAS","JEUS")`가 2종 반환.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/packs/wasJeus.ts src/lib/packs/wasJeus.test.ts src/lib/packs/registry.ts
git commit -m "feat: JEUS 팩(파일기반 JE-01~13) + 입력 스펙, 레지스트리 등록"
```

---

### Task 3: WebtoB 팩 (파일기반 WT-01~09)

**Files:**
- Create: `src/lib/packs/webWebtob.ts`
- Test: `src/lib/packs/webWebtob.test.ts`
- Modify: `src/lib/packs/registry.ts` (`ALL_PACKS` 등록)

**Interfaces:**
- Produces: `webtobPack: VendorPack` (category "WEB", vendors ["WebtoB"], requiredInputs 1종, evidence, evaluate WT-01~09).

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/packs/webWebtob.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { webtobPack } from "./webWebtob";

const PROVIDED = new Set(["webtob_dir"]);
function tasks(map: Record<string, string>) {
  return Object.entries(map).map(([taskName, stdout]) => ({ taskName, stdout }));
}

describe("webtobPack", () => {
  it("declares webtob_dir(path), no secret", () => {
    expect(webtobPack.requiredInputs!.map((s) => s.name)).toEqual(["webtob_dir"]);
    expect(webtobPack.requiredInputs![0].kind).toBe("path");
  });

  it("WT-01 fails when Options contains INDEX (directory listing)", () => {
    const httpm = `*NODE\nDocroot = \"/home/webtob/docs\"\nOptions = \"INDEX\"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-01")!.status).toBe("fail");
  });

  it("WT-01 passes when Options has no INDEX", () => {
    const httpm = `*NODE\nOptions = \"FollowSymLinks\"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-01")!.status).toBe("pass");
  });

  it("WT-03 fails when dangerous methods are allowed", () => {
    const httpm = `*NODE\nMethod = \"GET,POST,PUT,DELETE\"\n`;
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": httpm }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-03")!.status).toBe("fail");
  });

  it("WT-02 fails on group/other-writable http.m", () => {
    const r = webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m perms": "webtob:webtob 666" }), inputsProvided: PROVIDED });
    expect(r.find((x) => x.id === "WT-02")!.status).toBe("fail");
  });

  it("reviews when input missing or file missing", () => {
    expect(webtobPack.evaluate({ findings: null, tasks: [], inputsProvided: new Set() }).find((x) => x.id === "WT-01")!.status).toBe("review");
    expect(webtobPack.evaluate({ findings: null, tasks: tasks({ "WT: http.m content": "__MISSING__" }), inputsProvided: PROVIDED }).find((x) => x.id === "WT-01")!.status).toBe("review");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/packs/webWebtob.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 팩 구현**

Create `src/lib/packs/webWebtob.ts`. 구조:
- `REQUIRED_INPUTS`: `webtob_dir`(path, required, placeholder `/home/webtob`). **secret 없음.**
- 경로(quote): `HTTPM = {{ (webtob_dir + "/config/http.m") | quote }}`.
- EVIDENCE: `WT: http.m content`(cat, 없으면 `__MISSING__`), `WT: http.m perms`(`stat -c "%U:%G %a"`). (티베로 파일 패턴, `sh -c` 래퍼 없음.)
- 파싱 헬퍼: `directive(text, name)`=`Name = "..."` 값 추출(대소문자 무시), `isMissing`, `parseMode`/`isOverPermissive`.
- evaluate(ctx): `provided = inputsProvided.has("webtob_dir")`. `!provided` → 모두 review. content가 `__MISSING__` → 내용 의존 항목 review; perms가 `__MISSING__` → WT-02 review.
  - WT-01: `Options` 값에 `INDEX`(대소문자 무시, 토큰) 있으면 fail, 없으면 pass.
  - WT-02: http.m perms 그룹/기타 쓰기 비트 있으면 fail, 아니면 pass(형식 파싱 실패면 review — fail-closed).
  - WT-03: `Method` 값에 PUT/DELETE/TRACE/OPTIONS 등 위험 메서드 있으면 fail; Method 절이 없으면 review(기본 허용 가능); GET/POST/HEAD만이면 pass.
  - WT-04: `ErrorDocument` 설정 없으면 review(기본 에러페이지 노출 가능), 있으면 pass.
  - WT-05: http.m에 SSL 절(`*SSL`/`SSLFlag`/443) 있으면 pass, 없으면 fail.
  - WT-06: `*LOGGING`/`Logging` 절 있으면 pass, 없으면 review.
  - WT-07: 요청 제한 관련 지시어(`MaxUser`/`Timeout`/요청 크기) 없으면 review, 있으면 pass.
  - WT-08: 상위경로/심볼릭 링크 허용(`FollowSymLinks`, `..` 허용) 설정 있으면 fail, 없으면 pass.
  - WT-09: Admin/wsadmin 리스너가 전체 개방이면 review, 아니면 pass(관련 설정 없으면 review).
- itemIds: WT-01~09. detect: `(): boolean => true`. 반환 순서 WT-01..WT-09.

(주의: http.m 절/지시어 정확 표기는 draft. 픽스처 기준 구현, 실 인스턴스에서 표기 다르면 정규식만 조정.)

- [ ] **Step 4: 레지스트리 등록**

`src/lib/packs/registry.ts`: `import { webtobPack } from "./webWebtob";` + `ALL_PACKS`에 추가. registry.test.ts pack-id에 `"webtob"` 추가(정합 테스트 있으면).

- [ ] **Step 5: 검증**

Run: `npx vitest run src/lib/packs/webWebtob.test.ts && npx vitest run && npx tsc --noEmit && npx eslint src/lib/packs/webWebtob.ts src/lib/packs/webWebtob.test.ts src/lib/packs/registry.ts && npm run build`
Expected: 팩 테스트 PASS, 전체 통과, 타입·린트·빌드 클린. `getVendorInputSpecs("WEB","WebtoB")`가 1종 반환.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/packs/webWebtob.ts src/lib/packs/webWebtob.test.ts src/lib/packs/registry.ts
git commit -m "feat: WebtoB 팩(파일기반 WT-01~09) + 입력 스펙, 레지스트리 등록"
```

---

### Task 4: 실 검증 (수동) — 설정파일 형식 확인

코드 검증은 Task 1~3 픽스처로 끝났다. domain.xml/http.m 실제 요소·절 표기는 실 인스턴스에서만 확정된다.

- [ ] **Step 1:** 실 JEUS에 자산 등록(WAS→JEUS, JEUS_HOME·도메인) 후 점검 → `JE: domain.xml content` 원시 출력을 확인해 `session-config`/`listener`/`data-source`/`error` 요소 표기가 파싱과 맞는지 검증, 다르면 정규식 조정(판정 로직 유지).
- [ ] **Step 2:** 실 WebtoB에 자산 등록(WEB→WebtoB, WEBTOBDIR) 후 `WT: http.m content`의 `Options`/`Method`/`SSL`/`Logging` 절 표기 확인, 필요 시 정규식 조정.
- [ ] **Step 3:** 대표 취약 설정(디렉터리 리스팅 ON, 평문 비번, SSL 없음)에서 해당 항목이 fail로 잡히는지 확인.

---

## Self-Review

**Spec coverage (스펙 §4/§5 → 태스크):**
- JEUS 파일기반 JE-01~13(§4-3의 A 증거 항목) → Task 1(카탈로그)·Task 2(팩). ✓ 콘솔 JE-14는 플랜 B(범위 밖 명시).
- WebtoB 파일기반 WT-01~09(§5-3의 A 항목) → Task 1·Task 3. ✓ 콘솔 WT-10은 플랜 B.
- 벤더 등록(WAS→JEUS, WEB→WebtoB) → Task 1. ✓
- 프레임워크 재사용(입력 선언→폼→스캔) → 기존 프레임워크 그대로(secret 없는 경로 입력). ✓
- 명령주입 방지(quote), fail-closed → Task 2/3 구현·테스트. ✓
- 실 형식 검증 → Task 4(수동). ✓

**Placeholder scan:** domain.xml/http.m 요소 표기는 실 인스턴스 의존 → Task 4로 명시 분리(파싱은 픽스처로 완결 검증, draft 조정은 정규식만). 판정 기준·입력·evidence는 구체 명시. 콘솔 항목은 플랜 B로 명시(범위 밖).

**Type consistency:** evidence 태스크명(`JE: ...`/`WT: ...`)이 Task 2/3 evidence와 evaluate 파싱에서 동일. itemIds(JE-01~13/WT-01~09)가 카탈로그(Task 1)와 팩(Task 2/3)에서 일치. 입력 변수명(`jeus_home`/`jeus_domain`/`webtob_dir`)이 팩·폼·스캔에서 동일. `getVendorInputSpecs` 반환이 폼·스캔과 정합.
