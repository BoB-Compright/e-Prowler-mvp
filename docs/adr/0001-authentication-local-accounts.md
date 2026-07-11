# 0001. 인증 최소판 — 자체 계정·세션·프로필

- **상태**: Accepted
- **일자**: 2026-07-10
- **관련 이슈**: [#78 인증 통합: 사용자 프로필·로그아웃·알림 기반](https://github.com)

## 배경

`docs/superpowers/specs/2026-07-09-reskin-backlog.md`의 Task 3에서 목업 셸에 있던 사용자
프로필 블록·로그아웃을 실제 기능으로 구현하려면 그 전에 인증/세션 체계가 있어야 한다.
이슈 #78은 이를 위한 아키텍처 결정을 사람 주도로 먼저 내리도록 요구한다. 제품 결정은
바인딩으로 확정되어 이번 ADR 작성 시점에는 "무엇을 만들지"가 아니라 "어떻게 만들지"만
남아 있었다:

> 자체 계정 최소판: 로컬 계정(아이디/비밀번호) + httpOnly 세션 쿠키 + 로그인/로그아웃 +
> 헤더 프로필 블록. SSO 없음. 알림은 이번 범위 아님.

## 결정

### 1. 계정·비밀번호 해시: Node 내장 `crypto.scrypt`

새 의존성(bcrypt/argon2 등)을 추가하지 않는다. 이 repo는 이미 공유 링크 비밀번호에
`crypto.scryptSync` + salt + `timingSafeEqual`을 쓰고 있다(`src/lib/crypto/sharePassword.ts`).
계정 비밀번호도 동일한 패턴(`src/lib/auth/password.ts`)을 따른다 — 저장 형식은
`<salt-hex>:<hash-hex>`, salt는 매 해시마다 `randomBytes(16)`로 새로 생성한다.

- 대안으로 고려한 bcrypt/argon2는 네이티브 모듈 추가 의존성이 필요해 기각.
- scrypt는 비밀번호 해시로 알려진 안전한 KDF이고, Node 표준 라이브러리에 내장돼 있어
  이 프로젝트의 "신규 의존성 최소화" 원칙에 부합한다.

### 2. 세션: 랜덤 토큰 + DB 해시 저장 + httpOnly 쿠키

- 로그인 성공 시 `crypto.randomBytes(32)`로 세션 토큰(원문)을 생성해 쿠키 값으로 내려준다.
- DB에는 원문 토큰을 저장하지 않고 `sha256(token)` 해시만 `sessions.token_hash`(UNIQUE)에
  저장한다 — DB 파일이 유출돼도 쿠키 없이는 세션을 재사용할 수 없다. (세션 토큰은
  32바이트 랜덤값이라 무차별 대입이 비현실적이므로 scrypt 같은 고비용 KDF은 불필요하고,
  단순 SHA-256 해시 후 인덱스 조회로 충분하다 — 이는 비밀번호 해시와는 다른 위협 모델이다.)
- 쿠키 속성: `httpOnly`, `sameSite: "lax"`, `path: "/"`, 운영 환경(`NODE_ENV=production`)에서는
  `secure`. 만료 7일 — 로그인 시각 기준 `sessions.expires_at`과 쿠키 `expires`를 함께 설정한다.
- 로그아웃: 쿠키에 담긴 토큰으로 `sessions` 행을 삭제(무효화)하고 쿠키를 즉시 만료시킨다.
- 세션 조회(`verifySession`) 시 만료된 행을 발견하면 그 자리에서 삭제해 테이블이
  무한정 커지지 않게 한다(별도 정리 배치 없음 — MVP 규모에서는 충분하다).

### 3. 비인증 경계 — 절대 규칙

아래 경로는 세션 없이 접근 가능해야 한다:

- `/share/[token]`, `/api/share/[token]` — 공유 링크의 존재 이유 자체가 비인증 접근이므로.
- `/login`, `/api/auth/login` — 로그인 플로우 자체.
- Next 정적 자산(`/_next/*`, `favicon.ico` 등).

그 외 모든 페이지·API는 세션이 필요하다. 미인증 페이지 요청은 `/login`으로 리다이렉트,
미인증 API 요청은 `401`을 반환한다.

### 4. 가드 구조 — 2단계 (Next 16 `proxy` + 서버 컴포넌트 DAL)

Next 16은 `middleware.ts` 컨벤션을 `proxy.ts`로 개명했다(동작은 동일, `nodejs` 런타임
고정, `edge` 런타임 불가). 이 프로젝트는 `src/app`과 같은 레벨인 `src/proxy.ts`에
프록시를 둔다.

**문제**: `better-sqlite3`는 네이티브 addon(`.node` 바이너리)이다. `proxy.ts`는 앱 라우트와
별도의 번들링 파이프라인을 거치므로, 여기서 `better-sqlite3`(따라서 `getDb()`, 그리고
그것을 임포트하는 모든 모듈)를 직접 import하면 번들링이 깨지거나 최소한 매 요청마다
프록시 레이어에서 파일 DB 커넥션을 여는 부담이 생긴다. Next 공식 인증 가이드도 "Proxy는
프리페치된 라우트에서도 실행되므로 DB 조회 없이 쿠키만 읽는 낙관적(optimistic) 검사만
하라"고 권고한다.

**결정**: 프록시(낙관적 선별) + 실검증 2계층(페이지는 레이아웃, API는 핸들러) 구조를 쓴다.

1. **`src/proxy.ts` (경량, DB 미접근)** — `src/lib/auth/constants.ts`(DB 의존성 없음)만
   import해서 요청 경로가 공개 경로인지 분류하고, 보호 경로라면 세션 쿠키의 "존재 여부"만
   확인한다. 쿠키가 없으면: API 경로는 401 JSON, 페이지 경로는 `/login`으로 리다이렉트.
   쿠키가 있으면(값의 유효성은 검증하지 않고) 통과시키되, 공개 경로 여부를 응답 요청
   헤더(`x-public-route: 1`)로 표시해 다음 단계(서버 컴포넌트)가 재사용할 수 있게 한다.
   **스푸핑 차단**: 프록시는 매 요청마다 클라이언트가 보낸 `x-public-route` 헤더를 먼저
   제거한 뒤 전달한다 — 이 헤더는 프록시만 쓸 수 있어야 하며, 지우지 않으면 공격자가
   직접 `x-public-route: 1`을 붙여 레이아웃의 실검증을 건너뛸 수 있다.
2. **`requireSessionUserOrRedirect()` (페이지 실검증, DB 접근)** — 루트 레이아웃
   (`src/app/layout.tsx`)이 모든 페이지를 감싸므로, 여기서 `x-public-route` 헤더가 없는
   요청(=보호 페이지)에 대해서만 쿠키의 세션 토큰을 DB와 대조해 실제로 유효한지 검사한다.
   무효/만료 세션이면 `redirect("/login")`. 공개 경로(`/login`, `/share/*`)에서는 이 검사를
   건너뛰고, 대신 비검증 조회(`getSessionUserFromCookies()`)로 "로그인은 돼 있으나 공개
   페이지를 보는 중"인 경우에 한해 헤더 프로필 블록을 채우는 데만 쓴다.
3. **`requireApiSession(request)` (API 실검증, DB 접근)** — 모든 보호 API 라우트 핸들러의
   첫 문장에서 호출한다(`src/lib/auth/requireSession.ts`). 유효한(DB 대조, 미만료) 세션이
   없으면 401 JSON 응답을 반환하고, 유효하면 null을 반환해 핸들러가 진행한다. 프록시의
   쿠키 존재 검사는 낙관적 선별일 뿐이라 위조 쿠키(`nhg_session=garbage`)를 통과시키므로,
   실제로 요청을 막는 것은 이 핸들러 레벨 검증이다(종적 방어, defense in depth).
   `/api/share/[token]`(공유 링크)과 `/api/auth/*`(로그인 플로우 자체)에는 넣지 않는다.

**라우트 핸들러 유닛 테스트는 인증을 정직하게 통과한다**: 각 테스트가 자기 in-memory
DB에 실제 사용자+세션을 만들고(`createUser`/`createSession`) 그 세션 쿠키를 요청 헤더로
전달한다. env 플래그 같은 인증 우회 장치는 두지 않는다 — 테스트용 우회 장치는 그 자체가
프로덕션 우회 경로가 되기 때문이다. 보호 API 테스트 파일마다 "유효 세션 없이는 401"
케이스를 함께 둔다.

**이력**: 최초 구현(0fbdc91)은 "프록시 단일 경계 + 기존 핸들러 미변경"이었으나, 위조
쿠키가 프록시의 존재 검사를 통과해 모든 보호 API에 접근할 수 있다는 보안 리뷰
지적(Critical)에 따라 핸들러 레벨 `requireApiSession()` 종적 방어로 전환했다.
`x-public-route` 스푸핑 차단(위 1의 헤더 제거)도 같은 리뷰에서 나왔다.

### 5. 초기 관리자 계정 — 첫 기동 시 env 기반 생성

`npm run seed:admin` 같은 별도 스크립트 대신, 이미 존재하는 `src/instrumentation.ts`의
`register()` 훅(Node 런타임에서 서버 기동 시 1회 실행, CVE poller/스케줄러도 여기서
시작한다)에 `ensureSeedAdmin()`을 추가한다.

- 환경변수 `AUTH_ADMIN_USERNAME` / `AUTH_ADMIN_PASSWORD`가 설정돼 있고 `users` 테이블이
  비어 있을 때만 계정을 생성한다(멱등 — 이미 계정이 있으면 아무것도 하지 않는다).
- 환경변수가 없으면 계정을 만들지 않고 안내 로그만 남긴다(부팅 실패 아님 — 로컬 개발 시
  DB를 밀어버리고 재기동하는 경우가 잦으므로).
- 비밀번호는 어떤 로그에도 평문으로 남기지 않는다. 계정 생성 로그는 사용자명만 출력한다.
- 별도 시드 스크립트를 만들지 않은 이유: 이를 위해 `tsx`/`ts-node` 같은 새 실행
  의존성을 추가해야 하는데, 이는 "신규 의존성 최소화" 원칙과 충돌한다. `instrumentation.ts`는
  이미 Next 빌드 파이프라인 안에서 TypeScript와 `@/*` 경로 별칭을 그대로 쓸 수 있으므로
  새 도구 없이 요구사항을 만족한다.

### 6. 헤더 프로필 블록

`AppHeader`(client component)는 `user: { username: string } | null` prop을 받는다.
루트 레이아웃(server component)이 세션을 조회해 내려준다. 로그인 상태면 이니셜 원형
아바타(사용자명 첫 글자) + 사용자명 + 로그아웃 버튼을 표시하고, 아니면 아무것도
렌더링하지 않는다(목업의 알림 아이콘·배지는 이번 범위 밖 — 이슈 #78 본문 그대로).

## 대안으로 검토했으나 기각

| 대안 | 기각 사유 |
|---|---|
| 사내 SSO 연동 | 제품 결정으로 이번 범위 제외(SSO 없음, 바인딩) |
| JWT stateless 세션(서명된 쿠키만, DB 미조회) | 로그아웃 시 즉시 무효화가 안 됨(만료까지 유효) — 바인딩 요구사항(로그아웃 시 무효화)과 충돌 |
| bcrypt/argon2 | 신규 의존성 — Node 내장 scrypt로 충분 |
| `proxy.ts`에서 `better-sqlite3`로 직접 세션 검증 | 네이티브 addon의 프록시 번들 제약, 매 요청 DB 조회 비용 — Next 공식 가이드도 낙관적 검사만 권고 |
| 프록시 단일 경계(핸들러 미변경, 최초 구현) | 위조 쿠키가 존재 검사를 통과해 모든 보호 API 접근 가능(보안 리뷰 Critical) — 핸들러 레벨 `requireApiSession()` 종적 방어로 전환, 기존 테스트는 실제 세션 쿠키를 만들어 정직하게 통과시킴 |
| 테스트용 인증 우회 env 플래그 | 우회 장치 자체가 프로덕션 우회 경로가 됨 — 테스트가 실제 사용자+세션을 생성해 인증을 통과하는 쪽을 선택 |

## 결과

- 신규 테이블: `users`, `sessions` (`src/lib/db/index.ts`의 `SCHEMA`에 `CREATE TABLE IF
  NOT EXISTS`로 추가 — 기존 ALTER 기반 멱등 마이그레이션 패턴과 달리 완전히 새 테이블이라
  별도 마이그레이션 분기 없이도 멱등하다).
- 신규 모듈: `src/lib/auth/{constants,password,users,session,requireSession,seedAdmin}.ts`.
- 신규 라우트: `src/app/login/page.tsx`, `src/app/api/auth/login/route.ts`,
  `src/app/api/auth/logout/route.ts`.
- 신규 가드: `src/proxy.ts` + 모든 보호 API 핸들러 첫 줄의 `requireApiSession()`.
- 변경: `src/app/_components/AppHeader.tsx`(프로필 블록), `src/app/layout.tsx`(세션 조회 +
  보호 페이지 리다이렉트), `src/instrumentation.ts`(관리자 시드 호출), 보호 API 라우트
  16개 파일(핸들러 21개)에 세션 가드 삽입.
