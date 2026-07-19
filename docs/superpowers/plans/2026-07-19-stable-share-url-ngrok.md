# 안정적 PM 공유 URL (ngrok 고정 도메인 + 공유 전용 노출) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PM 공유 링크를 ngrok 고정 도메인 기반의 안 바뀌는 URL로 만들고, 그 공개 호스트로 들어온 요청은 공유 페이지만 열리도록 앱 레이어에서 차단한다.

**Architecture:** 데이터는 점검자 노트북의 로컬 SQLite에 그대로 두고, 점검자가 자기 ngrok 고정 도메인(`xxx.ngrok-free.app`)으로 localhost:3000을 수동 노출한다. `SHARE_BASE_URL` 환경변수가 링크 생성의 고정 주소이자 `src/proxy.ts`가 잠글 "공개 공유 호스트"를 정한다. 공개 호스트로 온 요청은 `/share`·`/api/share`만 통과시키고 나머지는 404.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts` = nodejs 런타임 미들웨어), React 19, TypeScript strict, Vitest.

## Global Constraints

- `src/proxy.ts`가 import하는 모듈은 **better-sqlite3를 직·간접으로 import하면 안 된다**(별도 번들 파이프라인 — `docs/adr/0001-authentication-local-accounts.md`). 새 공유 헬퍼는 순수 함수만 두고 무거운 import 금지.
- `var(--color-*)` 아비트러리 표기 금지, 테마 유틸리티 사용(이 플랜은 UI 스타일 변경 없음).
- 링크 생성은 `SHARE_BASE_URL` 설정 시 그 값, 미설정 시 `window.location.origin` 폴백(하위 호환).
- 공개 공유 호스트에서 공유 외 경로는 redirect/401이 아니라 **404**(존재 은폐).
- 공유 허용 경로: `/share`, `/share/**`, `/api/share`, `/api/share/**`.
- 테스트는 실제 코드로(모의 최소화), 각 태스크는 독립적으로 테스트 가능한 산출물로 끝낸다.

---

### Task 1: 공유 URL·호스트 판별 순수 헬퍼 (`shareUrl.ts`) 복구·확장

리버트됐던 `resolveShareBaseUrl`/`buildShareUrl`을 되살리고, proxy가 쓸 호스트 판별·경로 allowlist 순수 함수를 같은 모듈에 추가한다. 이 모듈은 아무것도 무겁게 import하지 않으므로 proxy에서 안전하게 쓸 수 있다.

**Files:**
- Create: `src/lib/projects/shareUrl.ts`
- Test: `src/lib/projects/shareUrl.test.ts`

**Interfaces:**
- Produces:
  - `resolveShareBaseUrl(env?: Record<string,string|undefined>): string | null`
  - `buildShareUrl(baseUrl: string, token: string): string`
  - `resolveShareHost(env?: Record<string,string|undefined>): string | null` — `SHARE_BASE_URL`의 호스트(`new URL(...).host`), 미설정·파싱실패 시 `null`
  - `isShareHostRequest(requestHost: string | null, env?): boolean` — 요청 호스트가 공개 공유 호스트와 일치하는지
  - `isAllowedShareOnlyPath(pathname: string): boolean` — 공유 허용 경로 여부

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/projects/shareUrl.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  resolveShareBaseUrl,
  resolveShareHost,
  isShareHostRequest,
  isAllowedShareOnlyPath,
} from "./shareUrl";

describe("resolveShareBaseUrl", () => {
  it("returns the configured base URL", () => {
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "https://myname.ngrok-free.app" })).toBe(
      "https://myname.ngrok-free.app",
    );
  });

  it("strips trailing slashes and surrounding whitespace", () => {
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "  https://myname.ngrok-free.app/  " })).toBe(
      "https://myname.ngrok-free.app",
    );
  });

  it("returns null when unset or blank", () => {
    expect(resolveShareBaseUrl({})).toBeNull();
    expect(resolveShareBaseUrl({ SHARE_BASE_URL: "   " })).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("joins the base URL and share token path", () => {
    expect(buildShareUrl("https://myname.ngrok-free.app", "abc123")).toBe(
      "https://myname.ngrok-free.app/share/abc123",
    );
  });
});

describe("resolveShareHost", () => {
  it("returns the host of SHARE_BASE_URL", () => {
    expect(resolveShareHost({ SHARE_BASE_URL: "https://myname.ngrok-free.app" })).toBe(
      "myname.ngrok-free.app",
    );
  });

  it("returns null when unset or unparseable", () => {
    expect(resolveShareHost({})).toBeNull();
    expect(resolveShareHost({ SHARE_BASE_URL: "not a url" })).toBeNull();
  });
});

describe("isShareHostRequest", () => {
  const env = { SHARE_BASE_URL: "https://myname.ngrok-free.app" };
  it("is true when the request host matches the share host", () => {
    expect(isShareHostRequest("myname.ngrok-free.app", env)).toBe(true);
  });
  it("is false for localhost or other hosts", () => {
    expect(isShareHostRequest("localhost:3000", env)).toBe(false);
    expect(isShareHostRequest(null, env)).toBe(false);
  });
  it("is false when SHARE_BASE_URL is unset (gate disabled)", () => {
    expect(isShareHostRequest("myname.ngrok-free.app", {})).toBe(false);
  });
});

describe("isAllowedShareOnlyPath", () => {
  it("allows share pages and share API", () => {
    expect(isAllowedShareOnlyPath("/share")).toBe(true);
    expect(isAllowedShareOnlyPath("/share/abc123")).toBe(true);
    expect(isAllowedShareOnlyPath("/api/share")).toBe(true);
    expect(isAllowedShareOnlyPath("/api/share/abc123")).toBe(true);
  });
  it("blocks login, dashboard and internal APIs", () => {
    expect(isAllowedShareOnlyPath("/login")).toBe(false);
    expect(isAllowedShareOnlyPath("/")).toBe(false);
    expect(isAllowedShareOnlyPath("/api/assets")).toBe(false);
    expect(isAllowedShareOnlyPath("/sharewolf")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/projects/shareUrl.test.ts`
Expected: FAIL — `Cannot find module './shareUrl'`

- [ ] **Step 3: 최소 구현 작성**

Create `src/lib/projects/shareUrl.ts`:

```typescript
// 공유 링크의 고정 베이스 URL (#81 후속): 점검자가 localhost로 접속·작업해도
// 복사·QR·메일에 담기는 주소는 PM이 실제로 열 수 있는 고정 주소(ngrok 도메인)여야
// 한다. SHARE_BASE_URL이 설정돼 있으면 그 값을 쓰고, 없으면 호출부가
// window.location.origin으로 폴백한다. 이 모듈은 무거운 import가 없어 proxy(미들웨어)에서
// 안전하게 재사용된다 — 공개 공유 호스트 판별에도 쓰인다.

export function resolveShareBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.SHARE_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function buildShareUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/share/${token}`;
}

// SHARE_BASE_URL의 호스트명. proxy가 "이 요청이 공개 공유 호스트로 온 것인가"를
// 판정하는 기준. 미설정·파싱 실패 시 null(= 게이트 비활성).
export function resolveShareHost(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const base = resolveShareBaseUrl(env);
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

export function isShareHostRequest(
  requestHost: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const shareHost = resolveShareHost(env);
  return shareHost !== null && requestHost === shareHost;
}

const SHARE_ALLOWED_EXACT = new Set(["/share", "/api/share"]);
const SHARE_ALLOWED_PREFIXES = ["/share/", "/api/share/"];

// 공개 공유 호스트에서 통과시킬 경로(공유 페이지 + 공유 API). 그 외는 proxy가 404.
export function isAllowedShareOnlyPath(pathname: string): boolean {
  if (SHARE_ALLOWED_EXACT.has(pathname)) return true;
  return SHARE_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/projects/shareUrl.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/projects/shareUrl.ts src/lib/projects/shareUrl.test.ts
git commit -m "feat: 공유 고정 베이스 URL·공유 호스트 판별 순수 헬퍼 복구·확장"
```

---

### Task 2: 링크 생성에 `SHARE_BASE_URL` 연동 (ShareLinkPanel + page)

리버트됐던 UI 연동을 복구한다. 설정 시 복사·QR·메일 링크가 모두 고정 도메인으로 생성되고, 미설정 시 origin 폴백.

**Files:**
- Modify: `src/app/projects/[id]/ShareLinkPanel.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes (Task 1): `buildShareUrl(baseUrl, token)`, `resolveShareBaseUrl()`.

- [ ] **Step 1: `ShareLinkPanel.tsx` 수정**

`import` 블록에 추가(기존 `buildShareMailto` import 아래):

```tsx
import { buildShareUrl } from "@/lib/projects/shareUrl";
```

컴포넌트 props에 `shareBaseUrl` 추가:

```tsx
  projectName,
  pmName,
  pmEmail,
  shareBaseUrl,
}: {
  projectId: string;
  shareToken: string;
  shareStatus: ShareStatus;
  projectName: string;
  pmName: string;
  pmEmail: string;
  shareBaseUrl: string | null;
}) {
```

`shareUrl`을 세팅하는 effect를 교체(기존 `setShareUrl(\`${window.location.origin}/share/${token}\`);` 한 줄과 의존성 배열):

```tsx
    // SHARE_BASE_URL(고정 공개 주소)이 설정돼 있으면 점검자의 접속 주소와 무관하게
    // 그 주소로 링크를 만든다 — localhost로 작업 중이어도 복사·QR·메일 주소가
    // PM이 열 수 있는 고정 주소가 되도록.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShareUrl(buildShareUrl(shareBaseUrl ?? window.location.origin, token));
```

그리고 이 effect의 의존성 배열을 `[token]` → `[token, shareBaseUrl]`로 변경.

- [ ] **Step 2: `page.tsx` 수정**

`import` 블록에 추가(기존 `ShareLinkPanel` import 아래):

```tsx
import { resolveShareBaseUrl } from "@/lib/projects/shareUrl";
```

`<ShareLinkPanel .../>` 호출에 prop 추가(`pmEmail={project.pmEmail}` 아래):

```tsx
          shareBaseUrl={resolveShareBaseUrl()}
```

- [ ] **Step 3: 타입체크·린트·빌드로 검증**

Run: `npx tsc --noEmit && npx eslint "src/app/projects/[id]/ShareLinkPanel.tsx" "src/app/projects/[id]/page.tsx" && npx vitest run`
Expected: 타입 에러 없음, 린트 통과, 전체 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add "src/app/projects/[id]/ShareLinkPanel.tsx" "src/app/projects/[id]/page.tsx"
git commit -m "feat: 공유 링크 생성에 SHARE_BASE_URL 고정 주소 연동(미설정 시 origin 폴백)"
```

---

### Task 3: `proxy.ts` 공유 전용 Host 게이트 + 테스트

공개 공유 호스트로 온 요청을 공유 경로만 통과시키고 나머지는 404로 막는다. localhost 등 다른 호스트는 기존 동작 유지.

**Files:**
- Modify: `src/proxy.ts`
- Test: `src/proxy.test.ts`

**Interfaces:**
- Consumes (Task 1): `isShareHostRequest(requestHost, env)`, `isAllowedShareOnlyPath(pathname)`.

- [ ] **Step 1: 실패 테스트 작성**

Create `src/proxy.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const SHARE_HOST = "myname.ngrok-free.app";

function req(host: string, path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = { host };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`http://${host}${path}`, { headers });
}

describe("proxy share-only host gate (#81)", () => {
  beforeEach(() => {
    process.env.SHARE_BASE_URL = `https://${SHARE_HOST}`;
  });
  afterEach(() => {
    delete process.env.SHARE_BASE_URL;
  });

  it("allows share pages on the public share host", () => {
    expect(proxy(req(SHARE_HOST, "/share/abc123")).status).toBe(200);
    expect(proxy(req(SHARE_HOST, "/api/share/abc123")).status).toBe(200);
  });

  it("404s login, dashboard and internal APIs on the public share host", () => {
    expect(proxy(req(SHARE_HOST, "/login")).status).toBe(404);
    expect(proxy(req(SHARE_HOST, "/")).status).toBe(404);
    expect(proxy(req(SHARE_HOST, "/api/assets")).status).toBe(404);
  });

  it("does not gate localhost — existing auth behavior is preserved", () => {
    // 쿠키 없는 보호 페이지는 /login으로 리다이렉트(기존 동작)
    const redirect = proxy(req("localhost:3000", "/"));
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toContain("/login");
    // /login 자체는 공개
    expect(proxy(req("localhost:3000", "/login")).status).toBe(200);
  });

  it("disables the gate entirely when SHARE_BASE_URL is unset", () => {
    delete process.env.SHARE_BASE_URL;
    // 공유 호스트로 와도 게이트 없음 → 기존 동작(쿠키 없는 /는 리다이렉트)
    expect(proxy(req(SHARE_HOST, "/")).status).toBe(307);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL — 공유 호스트 `/login`·`/`·`/api/assets`가 404가 아니라 리다이렉트(307)/401로 나옴

- [ ] **Step 3: `proxy.ts` 수정**

`import` 블록에 추가:

```typescript
import { isShareHostRequest, isAllowedShareOnlyPath } from "@/lib/projects/shareUrl";
```

`proxy` 함수 본문에서 기존 `const headers = new Headers(request.headers); headers.delete(PUBLIC_ROUTE_HEADER);` 바로 다음, `if (isPublicPath(pathname))` **앞에** 아래 블록을 삽입:

```typescript
  // 공개 공유 호스트(ngrok 고정 도메인)로 온 요청은 공유 경로만 통과시키고
  // 나머지는 404로 막는다 — 로그인/대시보드/내부 API의 존재조차 드러내지 않는다.
  // SHARE_BASE_URL 미설정이면 이 게이트는 완전히 비활성(모든 호스트 기존 동작).
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (isShareHostRequest(requestHost) && !isAllowedShareOnlyPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
```

(`NextResponse`는 이미 import돼 있음.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/proxy.test.ts`
Expected: PASS (4개 describe 케이스 전부)

- [ ] **Step 5: 전체 회귀·타입체크·린트**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/proxy.ts src/proxy.test.ts`
Expected: 전체 PASS, 타입·린트 클린

- [ ] **Step 6: 커밋**

```bash
git add src/proxy.ts src/proxy.test.ts
git commit -m "feat: proxy에 공유 전용 Host 게이트 — 공개 공유 호스트는 /share만 허용, 나머지 404 (#81)"
```

---

### Task 4: `.env.example` · 운영 문서 · README 갱신

점검자가 그대로 따라 할 수 있는 셋업 문서와 환경변수 안내를 추가한다.

**Files:**
- Modify: `.env.example`
- Create: `docs/ops/share-ngrok.md`
- Modify: `README.md`

- [ ] **Step 1: `.env.example` 수정**

`# NVD CVE API 설정 (선택사항)` 블록 **앞에** 아래를 삽입:

```bash
# ============================================
# 공유 링크 고정 베이스 URL (선택사항)
# ============================================
# PM 공유 링크(복사·QR·메일 본문)에 쓸 고정 공개 주소이자, proxy가 "공유 전용"으로
# 잠글 공개 호스트. ngrok 고정 도메인을 넣는다. 설정하면 점검자가 localhost로
# 작업해도 링크가 이 주소로 만들어지고, 이 호스트로 들어온 요청은 /share·/api/share만
# 열리고 로그인·대시보드·내부 API는 404가 된다. 미설정 시 접속 주소를 그대로 사용.
# 설정법: docs/ops/share-ngrok.md
# 예: SHARE_BASE_URL=https://myname.ngrok-free.app
SHARE_BASE_URL=

```

- [ ] **Step 2: `docs/ops/share-ngrok.md` 생성**

```markdown
# PM 공유 링크 외부 공개 — ngrok 고정 도메인 가이드

PM이 사내망 밖에서도 열 수 있는 **안 바뀌는 공유 링크**를 만드는 절차. 서버는 점검자
노트북에 그대로 두고, ngrok 고정 도메인으로 공유 화면만 인터넷에 노출한다. 점검자마다
자기 ngrok 계정 → 자기 고정 도메인이라 여러 명이 각자 링크를 갖는다.

## 동작 요약

- 링크는 재실행해도 안 바뀐다(ngrok 고정 도메인 + 프로젝트 공유 토큰). PM에게 한 번만 전달.
- 점검자가 재점검하면 같은 링크에서 최신 조치가 그대로 보인다(로컬 DB 라이브 서빙).
- 공개 도메인으로는 `/share`·`/api/share`만 열린다. 로그인·대시보드·내부 API는 404.
- 노트북/터널이 꺼진 동안은 열람 불가(주소는 그대로). 공유가 필요할 때 켠다(수동 실행).

## 사전 준비

- [ngrok](https://ngrok.com) 무료 가입 → 대시보드에서 **고정 도메인(Domain) 1개 발급**
  (무료 플랜 계정당 1개, 예: `myname.ngrok-free.app`).
- `ngrok` CLI 설치(`brew install ngrok`) 후 authtoken 등록:
  `ngrok config add-authtoken <토큰>`

## 절차

```bash
# 1. .env에 발급받은 고정 도메인을 지정 (앞에 https://)
#    SHARE_BASE_URL=https://myname.ngrok-free.app

# 2. NH-Guardian 서버 기동 (.env를 실어서 — AI/번역 동작 위해)
npm run start

# 3. 고정 도메인으로 localhost:3000 노출 (수동, 공유가 필요한 동안 켜 둠)
ngrok http --url=myname.ngrok-free.app 3000
```

이후 프로젝트 화면의 공유 링크(복사·QR·메일)가 모두
`https://myname.ngrok-free.app/share/<token>` 으로 생성된다.

## 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://myname.ngrok-free.app/share/유효토큰  # 200
curl -s -o /dev/null -w "%{http_code}\n" https://myname.ngrok-free.app/login          # 404
curl -s -o /dev/null -w "%{http_code}\n" https://myname.ngrok-free.app/api/assets     # 404
```

## 주의

- ngrok 무료 도메인은 브라우저 첫 방문 시 경고 페이지가 뜬다. PM에게 "Visit Site"를 한 번
  누르면 된다고 안내한다.
- 공유 화면은 비밀번호(5회 실패 15분 잠금)로 보호되지만 인터넷 노출이므로, 공유 비밀번호는
  추측하기 어려운 값으로 쓰고 공유가 끝나면 터널(ngrok)을 종료한다(Ctrl+C).
- 노트북이 꺼져 있으면(퇴근·절전) 그 시간엔 링크가 열리지 않는다. 링크 주소는 유지되므로
  재전달은 불필요하다.
```

- [ ] **Step 3: `README.md` 공유 섹션 갱신**

`README.md`에서 기존 quick tunnel 안내 문단(`**사내망 밖 PM에게 공유하기 (점검자별 임시 터널)**` 로 시작하는 문단과 그 아래 `npm run start` / `npm run tunnel` 코드블록, 설명 문단)을 아래로 교체:

```markdown
**사내망 밖 PM에게 공유하기 (점검자별 고정 링크)** — 공유 링크를 **안 바뀌는 고정 URL**로 만들려면 ngrok 고정 도메인을 쓴다. `.env`에 발급받은 도메인을 넣고 서버와 터널을 띄우면:

```bash
# .env: SHARE_BASE_URL=https://myname.ngrok-free.app
npm run start                                  # NH-Guardian 서버 기동
ngrok http --url=myname.ngrok-free.app 3000    # 고정 도메인으로 노출(수동)
```

공유 링크(복사·QR·메일)가 모두 `https://myname.ngrok-free.app/share/<token>` 으로 생성되고, 재실행해도 URL이 바뀌지 않아 PM에게 한 번만 전달하면 됩니다. 점검자가 재점검하면 같은 링크에서 최신 조치가 반영됩니다. 이 공개 도메인으로는 `/share`·`/api/share`만 열리고 로그인·대시보드·내부 API는 404로 차단됩니다(점검자는 localhost로 작업). 점검자마다 자기 도메인 = 자기 링크입니다. 자세한 설정은 [ngrok 공유 가이드](docs/ops/share-ngrok.md) 참고. (노트북/터널이 꺼진 시간엔 열람 불가하나 주소는 유지됩니다.)
```

- [ ] **Step 4: 문서 정합성·죽은 참조 확인**

Run: `grep -n "npm run tunnel\|trycloudflare\|SHARE_BASE_URL" README.md .env.example docs/ops/share-ngrok.md`
Expected: `npm run tunnel`/`trycloudflare`가 README에 더 이상 없음, `SHARE_BASE_URL`은 세 파일에 존재.

참고: `scripts/share-tunnel.sh`와 `package.json`의 `"tunnel"` 스크립트(quick tunnel)는 이 플랜 범위에서 제거하지 않는다 — 임시 터널이 필요한 경우를 위해 남겨두되, README 권장 경로는 ngrok 고정 도메인으로 바꾼다.

- [ ] **Step 5: 커밋**

```bash
git add .env.example docs/ops/share-ngrok.md README.md
git commit -m "docs: ngrok 고정 도메인 공유 셋업 가이드 + .env·README 갱신 (#81)"
```

---

### Task 5: 실 ngrok 검증 (점검자 authtoken 필요 — 수동)

코드 검증은 Task 1~3의 단위 테스트로 끝났다. 이 태스크는 실제 ngrok 고정 도메인으로 엔드투엔드 확인이며, ngrok 계정·authtoken이 준비된 뒤 수행한다(자동 테스트 아님).

- [ ] **Step 1:** `.env`에 `SHARE_BASE_URL=https://<발급도메인>` 설정 후 `npm run start`.
- [ ] **Step 2:** 별 터미널에서 `ngrok http --url=<발급도메인> 3000`.
- [ ] **Step 3:** 브라우저로 `https://<발급도메인>/share/<유효토큰>` 접속 → 비밀번호 게이트 표시 확인.
- [ ] **Step 4:** `https://<발급도메인>/login`, `.../api/assets` 접속 → 404 확인(내부 기능 차단).
- [ ] **Step 5:** localhost:3000으로 로그인해 재점검 실행 → 공유 링크 새로고침 시 최신 반영 확인.

---

## Self-Review

**Spec coverage (스펙 각 항목 → 태스크):**
- 로컬 SQLite 유지 → 변경 없음(구조 유지). ✓
- ngrok 고정 도메인 → Task 4 문서 + Task 2 링크 생성. ✓
- 점검자별/수동 실행 → Task 4 문서. ✓
- 공유 전용 노출을 앱 레이어에서 강제 → Task 3(proxy) + Task 1(헬퍼). ✓
- `SHARE_BASE_URL` 복구(링크 생성 + 공개 호스트 판별 겸용) → Task 1·2·3. ✓
- 404로 존재 은폐 → Task 3 테스트·구현. ✓
- 하위 호환(미설정 시 origin 폴백·게이트 비활성) → Task 1·2·3 테스트에 포함. ✓
- 테스트(shareUrl, proxy) → Task 1·3. ✓
- 한계·인터스티셜 문서화 → Task 4. ✓

**Placeholder scan:** TBD/TODO/"적절히 처리" 없음, 모든 코드 스텝에 실제 코드 존재. ✓

**Type consistency:** `resolveShareBaseUrl`/`buildShareUrl`/`resolveShareHost`/`isShareHostRequest`/`isAllowedShareOnlyPath` 시그니처가 Task 1 정의와 Task 2·3 사용처에서 일치. `shareBaseUrl: string | null` prop이 page→panel 간 일치. ✓
