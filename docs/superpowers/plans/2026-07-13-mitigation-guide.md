# 취약 항목 조치 가이드(미티게이션) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 취약(fail)·검토(review) 점검 항목마다 정적 조치 가이드(위험·조치 방법·설정 예시)를 리포트 상세와 PM 공유뷰에 항상 표시한다.

**Architecture:** 카탈로그에 정적 mitigations.json + getMitigation 로더. 리포트 API가 각 체크에 mitigation 부착, ReportView가 조치 가이드 섹션 렌더. 공유 API가 자산별 fail/review 항목+가이드를 반환, ShareGate가 렌더. 콘텐츠(스캔 벤더 세트)는 컨트롤러가 Claude 1회 생성→커밋.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, vitest.

## Global Constraints

- 테스트/타입/린트는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- mitigation은 AI 토글·점검시점과 무관하게 항상 제공(정적). 없는 항목은 `null` → UI 섹션 생략.
- 가이드 대상 status: **fail·review만**. pass/skip 미표시.
- 공유뷰는 기존 비노출 정책 유지 — evidence 원문·CVE·건수 비노출, **항목 제목·심각도·조치 가이드만** 추가.
- `Mitigation { risk: string; fix: string; example?: string }`. 저장은 `mitigations.json` 단일 파일 `{ [id]: Mitigation }`.
- 콘텐츠 범위(생성): 접두사 `U-`·`C-`·`WEB-`·`WAS-`·`DB-`·`PG-`(스캔 벤더). 보류 벤더 제외.
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build로 검증.

---

### Task 1: Mitigation 타입 + 시드 데이터 + 로더

**Files:**
- Modify: `src/lib/catalog/types.ts` (Mitigation 인터페이스 추가)
- Create: `src/lib/catalog/data/mitigations.json` (수작업 시드)
- Create: `src/lib/catalog/mitigations.ts` (로더)
- Modify: `src/lib/catalog/index.ts` (getMitigation 재export)
- Test: `src/lib/catalog/mitigations.test.ts`

**Interfaces:**
- Produces: `Mitigation { risk: string; fix: string; example?: string }`, `getMitigation(itemId: string): Mitigation | null`.

- [ ] **Step 1: 타입 추가**

`src/lib/catalog/types.ts` 파일 끝에 추가:

```typescript
// 취약(fail)·검토(review) 항목의 정적 조치 가이드. AI·점검시점과 무관하게 항상 제공.
export interface Mitigation {
  risk: string; // 이 취약점이 왜 위험한가 (1~2문장)
  fix: string; // 조치 방법 (설명/단계)
  example?: string; // 설정·명령 예시 (코드블록으로 렌더)
}
```

- [ ] **Step 2: 시드 데이터 작성**

`src/lib/catalog/data/mitigations.json`을 생성한다(스캔 벤더 세트는 이후 컨트롤러 생성으로 채워지며,
여기서는 테스트·즉시 데모용 대표 항목을 손으로 작성). 아래 내용 그대로:

```json
{
  "U-01": {
    "risk": "root 계정의 원격 접속이 허용되면 무차별 대입 공격의 직접 표적이 되고, 탈취 시 시스템 전체가 즉시 장악됩니다.",
    "fix": "SSH에서 root 직접 로그인을 금지하고, 일반 계정으로 접속 후 su/sudo로 권한을 상승하도록 구성합니다.",
    "example": "# /etc/ssh/sshd_config\nPermitRootLogin no\n\n# 적용\nsystemctl restart sshd"
  },
  "U-05": {
    "risk": "root(UID 0)와 동일한 UID를 가진 계정이 있으면 그 계정이 root와 동일한 전권을 갖게 되어 권한 통제가 무너집니다.",
    "fix": "root 외에 UID가 0인 계정이 없는지 확인하고, 있으면 해당 계정의 UID를 고유한 비-0 값으로 변경하거나 제거합니다.",
    "example": "# UID 0 계정 확인\nawk -F: '($3==0){print $1}' /etc/passwd\n# root 하나만 출력되어야 함"
  },
  "U-13": {
    "risk": "취약한 해시(예: DES/MD5)로 비밀번호를 저장하면 유출 시 오프라인 크래킹으로 쉽게 복원됩니다.",
    "fix": "SHA-512 등 강한 알고리즘으로 비밀번호를 저장하도록 설정합니다.",
    "example": "# /etc/login.defs\nENCRYPT_METHOD SHA512"
  },
  "U-16": {
    "risk": "/etc/passwd의 소유자·권한이 부적절하면 계정 정보가 변조되어 권한 상승이나 계정 위조로 이어질 수 있습니다.",
    "fix": "/etc/passwd의 소유자를 root로, 권한을 644 이하로 설정합니다.",
    "example": "chown root:root /etc/passwd\nchmod 644 /etc/passwd"
  },
  "U-18": {
    "risk": "/etc/shadow가 과도한 권한을 가지면 비밀번호 해시가 노출되어 크래킹의 대상이 됩니다.",
    "fix": "/etc/shadow의 소유자를 root로, 권한을 400(또는 600) 이하로 제한합니다.",
    "example": "chown root:root /etc/shadow\nchmod 400 /etc/shadow"
  }
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/lib/catalog/mitigations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getMitigation } from "./mitigations";
import { getCatalog } from "./index";

describe("getMitigation", () => {
  it("returns a mitigation for a seeded item", () => {
    const m = getMitigation("U-01");
    expect(m).not.toBeNull();
    expect(m!.risk.length).toBeGreaterThan(0);
    expect(m!.fix.length).toBeGreaterThan(0);
  });

  it("returns null for an item without a mitigation", () => {
    expect(getMitigation("NOPE-999")).toBeNull();
  });

  it("every mitigation key maps to a real catalog item id", () => {
    const ids = new Set(getCatalog().map((c) => c.id));
    // getMitigation의 소스 JSON 키가 실제 카탈로그 항목과 매칭되는지(오탈자 방지).
    const { default: data } = require("./data/mitigations.json") as { default: Record<string, unknown> };
    for (const key of Object.keys(data)) {
      expect(ids.has(key)).toBe(true);
    }
  });
});
```

주의: JSON require가 default 래핑되는지 여부는 tsconfig에 따라 다르다. 아래 구현의 로더가 쓰는 것과 동일한 import 방식으로 테스트에서도 접근하도록, 필요하면 `import data from "./data/mitigations.json"`로 바꿔 키를 순회한다(로더와 일치시키는 게 목적).

- [ ] **Step 4: 로더 구현**

`src/lib/catalog/mitigations.ts`:

```typescript
import mitigationsData from "./data/mitigations.json";
import type { Mitigation } from "./types";

const MITIGATIONS = mitigationsData as Record<string, Mitigation>;

// 항목 id의 정적 조치 가이드를 반환한다. 없으면 null(호출부가 섹션 생략).
export function getMitigation(itemId: string): Mitigation | null {
  return MITIGATIONS[itemId] ?? null;
}
```

`src/lib/catalog/index.ts` 파일 끝(또는 다른 export들과 함께)에 재export 추가:

```typescript
export { getMitigation } from "./mitigations";
export type { Mitigation } from "./types";
```

(만약 index.ts가 이미 `export type { ... } from "./types"`를 하고 있으면 Mitigation을 그 목록에 추가한다.)

- [ ] **Step 5: 테스트/타입/린트 통과**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/lib/catalog/mitigations.test.ts && npx tsc --noEmit && npx eslint src/lib/catalog/mitigations.ts src/lib/catalog/mitigations.test.ts src/lib/catalog/index.ts`
Expected: PASS, 에러 없음. (JSON require 방식이 tsc/eslint에서 걸리면 Step 3 주의대로 import 방식으로 통일.)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/catalog/types.ts src/lib/catalog/data/mitigations.json src/lib/catalog/mitigations.ts src/lib/catalog/index.ts src/lib/catalog/mitigations.test.ts
git commit -m "feat: 조치 가이드 정적 데이터 + getMitigation 로더(시드 항목)"
```

---

### Task 2: 리포트 API에 mitigation 부착

**Files:**
- Modify: `src/lib/checks/types.ts` (DecoratedCheckResult.mitigation)
- Modify: `src/app/api/runs/[id]/route.ts`
- Modify: `src/app/api/runs/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getMitigation`, `Mitigation`(@/lib/catalog).
- Produces: `DecoratedCheckResult.mitigation: Mitigation | null`. `GET /api/runs/[id]`의 각 check에 부착.

- [ ] **Step 1: 타입 필드 추가**

`src/lib/checks/types.ts`의 `DecoratedCheckResult`에 필드 추가(`example: string | null;` 다음):

```typescript
  example: string | null;
  mitigation: import("@/lib/catalog").Mitigation | null;
```

(또는 파일 상단에 `import type { Mitigation } from "@/lib/catalog";` 추가 후 `mitigation: Mitigation | null;`. 순환참조 우려 없으면 상단 import 방식 권장.)

- [ ] **Step 2: 실패하는 테스트 작성**

`src/app/api/runs/[id]/route.test.ts`의 기존 describe에 추가:

```typescript
  it("attaches the static mitigation guide to each check (#mitigation)", async () => {
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { saveCheckResults } = await import("@/lib/checks/store");
    const { GET } = await import("./route");

    const run = createRun("https://github.com/nh/x.git", "git", null);
    saveCheckResults(run.id, [{ id: "U-01", status: "fail", evidence: "e" }]);
    updateRunStage(run.id, "done", "succeeded");

    const res = await GET(new Request("http://localhost/api/runs/x", { headers: { cookie: await authCookie() } }), params(run.id));
    const body = await res.json();
    const u01 = body.checks.find((c: { id: string }) => c.id === "U-01");
    expect(u01.mitigation).not.toBeNull();
    expect(u01.mitigation.fix.length).toBeGreaterThan(0);
  });
```

(파일 상단에 `authCookie`/`params` 헬퍼가 이미 있다 — Task 재사용. 없으면 기존 테스트의 헬퍼를 참고해 맞춘다.)

- [ ] **Step 3: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/runs/[id]/route.test.ts"`
Expected: FAIL — mitigation 필드 없음.

- [ ] **Step 4: 구현**

`src/app/api/runs/[id]/route.ts`:
- import에 `getMitigation` 추가: `import { getCatalogItem, getMitigation } from "@/lib/catalog";`
- 체크 매핑에서 반환 객체에 필드 추가(`example: report?.example ?? null,` 다음):

```typescript
      example: report?.example ?? null,
      mitigation: getMitigation(result.id),
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/runs/[id]/route.test.ts" && npx tsc --noEmit && npx eslint "src/app/api/runs/[id]/route.ts" src/lib/checks/types.ts`
Expected: PASS, 에러 없음.

```bash
git add src/lib/checks/types.ts "src/app/api/runs/[id]/route.ts" "src/app/api/runs/[id]/route.test.ts"
git commit -m "feat: 런 리포트 API가 각 체크에 정적 조치 가이드(mitigation) 부착"
```

---

### Task 3: ReportView 조치 가이드 섹션

**Files:**
- Modify: `src/app/runs/[id]/report/ReportView.tsx`

**Interfaces:**
- Consumes: `DecoratedCheckResult.mitigation`(Task 2).

정적 검증(tsc/eslint/build)으로 대신.

- [ ] **Step 1: 조치 가이드 섹션 추가**

`src/app/runs/[id]/report/ReportView.tsx`의 상세 패널에서, 기존 조치방안(`{selected.remediation && (...)}`) 블록
**앞**(또는 근거·Evidence 다음)에 아래를 추가한다. `selected`가 fail/review이고 mitigation이 있을 때만:

```tsx
              {(selected.status === "fail" || selected.status === "review") && selected.mitigation && (
                <div className="mt-4.5">
                  <SectionLabel>조치 가이드</SectionLabel>
                  <p className="mt-1.5 text-sm leading-relaxed">
                    <span className="font-semibold">위험 · </span>
                    <InlineCodeText text={selected.mitigation.risk} />
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">
                    <span className="font-semibold">조치 · </span>
                    <InlineCodeText text={selected.mitigation.fix} />
                  </p>
                  {selected.mitigation.example && (
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap">
                      {selected.mitigation.example}
                    </pre>
                  )}
                </div>
              )}
```

주의: 실제 파일에서 상세 패널의 JSX 구조(들여쓰기·`selected` 변수명·`InlineCodeText`/`SectionLabel` 존재)를
먼저 읽고 정확한 위치에 삽입한다. (기존 AI "조치방안"(remediation) 블록은 그대로 둔다 — 공존.)

- [ ] **Step 2: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/runs/[id]/report/ReportView.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add "src/app/runs/[id]/report/ReportView.tsx"
git commit -m "feat: 리포트 상세에 취약·검토 항목 조치 가이드 섹션(정적, 항상)"
```

---

### Task 4: PM 공유뷰에 항목별 조치 가이드

**Files:**
- Modify: `src/app/api/share/[token]/route.ts`
- Modify: `src/app/api/share/[token]/route.test.ts`
- Modify: `src/app/share/[token]/ShareGate.tsx`

**Interfaces:**
- Consumes: `listCheckResults`(@/lib/checks/store), `getCatalogItem`/`getMitigation`(@/lib/catalog), `getRun`/`listRuns`.
- Produces: 공유 응답에 `findings: { assetId: string; items: ShareFinding[] }[]`.
  `ShareFinding { id: string; title: string; severity: string | null; status: "fail" | "review"; mitigation: Mitigation | null }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/share/[token]/route.test.ts`에 (기존 인증/헬퍼 패턴 재사용) 케이스 추가:

```typescript
  it("includes fail/review findings with mitigation for each asset's latest succeeded run (#mitigation)", async () => {
    const { createProject } = await import("@/lib/projects/store");
    const { createServerAsset } = await import("@/lib/assets/store");
    const { createRun, updateRunStage } = await import("@/lib/pipeline/runs");
    const { saveCheckResults } = await import("@/lib/checks/store");
    const { POST } = await import("./route");

    const project = createProject({ name: "P", pmName: "김", pmEmail: "a@nh.com", sharePassword: "pw" });
    const asset = createServerAsset({ displayName: "srv", hostIp: "10.0.0.1", hostname: "h", sshPort: 22, authType: "password", username: "u", secret: "p", projectId: project.id });
    const run = createRun(asset.hostIp!, "server", asset.id);
    saveCheckResults(run.id, [
      { id: "U-01", status: "fail", evidence: "secret-evidence" },
      { id: "U-13", status: "pass", evidence: "ok" },
    ]);
    updateRunStage(run.id, "done", "succeeded");

    const res = await POST(
      new Request(`http://localhost/api/share/${project.shareToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "pw" }),
      }),
      { params: Promise.resolve({ token: project.shareToken }) },
    );
    const body = await res.json();
    const finding = body.findings.find((f: { assetId: string }) => f.assetId === asset.id);
    expect(finding.items.map((i: { id: string }) => i.id)).toEqual(["U-01"]); // fail만, pass 제외
    expect(finding.items[0].mitigation.fix.length).toBeGreaterThan(0);
    // evidence 원문은 공유에 절대 포함되지 않는다.
    expect(JSON.stringify(body)).not.toContain("secret-evidence");
  });
```

(파일에 `createServerAsset`가 `projectId`를 받는지 확인 — 안 받으면 생성 후 프로젝트에 이동시키는 기존 헬퍼/함수를 쓴다.)

- [ ] **Step 2: 실패 확인**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/share/[token]/route.test.ts"`
Expected: FAIL — findings 없음.

- [ ] **Step 3: 공유 API 구현**

`src/app/api/share/[token]/route.ts`:
- import 추가: `import { getRun } from "@/lib/pipeline/runs";`(이미 listRuns 있음), `import { listCheckResults } from "@/lib/checks/store";`, `import { getCatalogItem, getMitigation } from "@/lib/catalog";`
- publicRuns 계산 뒤에 findings 조립 추가:

```typescript
  // 자산별 최근 성공 run의 취약·검토 항목 + 정적 조치 가이드. evidence 원문·CVE는 비노출.
  const findings = assets.map((asset) => {
    const latest = runs
      .filter((r) => r.assetId === asset.id && r.status === "succeeded")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return { assetId: asset.id, items: [] };
    const items = listCheckResults(latest.id)
      .filter((c) => c.status === "fail" || c.status === "review")
      .map((c) => ({
        id: c.id,
        title: getCatalogItem(c.id)?.title ?? c.id,
        severity: getCatalogItem(c.id)?.severity ?? null,
        status: c.status as "fail" | "review",
        mitigation: getMitigation(c.id),
      }));
    return { assetId: asset.id, items };
  });
```

- 반환에 `findings` 추가: `return NextResponse.json({ project: publicProject, assets: publicAssets, runs: publicRuns, findings });`

주의: `runs`는 `listRuns()` 결과이며 `status`가 "succeeded"인지 확인(파이프라인 완료는 stage "done" + status "succeeded"). `run.status === "succeeded"` 필터가 맞는지 실제 Run 타입으로 확인.

- [ ] **Step 4: 공유뷰 렌더**

`src/app/share/[token]/ShareGate.tsx`:
- `ShareData` 인터페이스에 `findings` 추가:

```typescript
interface ShareFinding {
  id: string;
  title: string;
  severity: string | null;
  status: "fail" | "review";
  mitigation: { risk: string; fix: string; example?: string } | null;
}
interface ShareData {
  project: { name: string; pmName: string };
  assets: ShareAsset[];
  runs: ShareRun[];
  findings: { assetId: string; items: ShareFinding[] }[];
}
```

- 데이터가 로드된 뒤(자산 테이블/점검 이력 렌더 영역) **"조치가 필요한 항목"** 카드를 추가한다. 자산별로
  `findings`의 items를 그룹으로 보여준다(항목 제목 + 심각도 배지 + 조치 가이드 위험/조치/예시). 기존
  `Card`·`StatusBadge`·`SectionLabel` 사용. items가 모두 비면 "조치 필요 항목 없음" 문구. 실제 파일의
  자산명 매핑(assets에서 id→displayName)과 렌더 위치를 읽고 자연스럽게 삽입:

```tsx
        {data.findings.some((f) => f.items.length > 0) && (
          <Card title="조치가 필요한 항목" bodyClassName="p-5">
            <div className="flex flex-col gap-5">
              {data.findings
                .filter((f) => f.items.length > 0)
                .map((f) => {
                  const assetName = data.assets.find((a) => a.id === f.assetId)?.displayName ?? f.assetId;
                  return (
                    <div key={f.assetId}>
                      <div className="mb-2 text-[13px] font-semibold">{assetName}</div>
                      <ul className="flex flex-col gap-3">
                        {f.items.map((it) => (
                          <li key={it.id} className="rounded-lg border border-border p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[13px] font-bold">{it.id}</span>
                              <StatusBadge status={it.status === "fail" ? "fail" : "review"}>
                                {it.status === "fail" ? "취약" : "검토"}
                              </StatusBadge>
                              <span className="text-[13px]">{it.title}</span>
                            </div>
                            {it.mitigation ? (
                              <div className="mt-2 text-[13px] leading-relaxed text-muted">
                                <p><span className="font-semibold text-text">위험 · </span>{it.mitigation.risk}</p>
                                <p className="mt-1"><span className="font-semibold text-text">조치 · </span>{it.mitigation.fix}</p>
                                {it.mitigation.example && (
                                  <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-text">
                                    {it.mitigation.example}
                                  </pre>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 text-[13px] text-muted italic">조치 가이드 준비 중입니다.</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}
```

`Card`·`StatusBadge`·`SectionLabel` import가 ShareGate에 이미 있는지 확인하고 없으면 추가한다.

- [ ] **Step 5: 통과 확인 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run "src/app/api/share/[token]/route.test.ts" && npx tsc --noEmit && npx eslint "src/app/api/share/[token]/route.ts" "src/app/api/share/[token]/route.test.ts" "src/app/share/[token]/ShareGate.tsx" && npx next build 2>&1 | tail -3`
Expected: PASS, 에러 없음, 빌드 성공.

```bash
git add "src/app/api/share/[token]/route.ts" "src/app/api/share/[token]/route.test.ts" "src/app/share/[token]/ShareGate.tsx"
git commit -m "feat: PM 공유뷰에 자산별 취약·검토 항목 조치 가이드(evidence 비노출 유지)"
```

---

## 실행 후(병합 전) 컨트롤러 작업 — 콘텐츠 생성
- 스캔 벤더 세트(접두사 `U-`·`C-`·`WEB-`·`WAS-`·`DB-`·`PG-`)의 카탈로그 항목 중 `mitigations.json`에 없는 것을
  Claude로 생성(각 항목 id·title·source ref를 주고 `{risk, fix, example}` 한국어 JSON 요청)해 `mitigations.json`에
  병합·커밋한다(번역 백필과 동형, 백그라운드 실행, 건별 커밋 아님 — 한 번에 병합 후 1 커밋).
- 생성 후 재빌드·프로덕션 재기동, 리포트 상세·PM 공유뷰에서 조치 가이드 확인.
