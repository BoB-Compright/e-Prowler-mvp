import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PUBLIC_ROUTE_HEADER, SESSION_COOKIE_NAME, isPublicPath } from "@/lib/auth/constants";
import { isShareHostRequest, isAllowedShareOnlyPath } from "@/lib/projects/shareUrl";

// Next 16 renamed the "middleware.ts" convention to "proxy.ts" (same runtime
// behavior, nodejs-only, no edge). This is intentionally lightweight — it
// only checks whether the session cookie is *present*, never verifies it
// against the database. Reasons this is a two-tier design (proxy here +
// requireSessionUserOrRedirect() in the root layout for the real check) are
// recorded in docs/adr/0001-authentication-local-accounts.md, section 4:
// mainly, better-sqlite3 is a native addon that this bundling pipeline can't
// be relied on to bundle, and Next's own auth guide recommends cookie-only
// (optimistic) checks in Proxy since it runs on every route, including
// prefetches.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip any client-supplied x-public-route header on EVERY request before
  // forwarding — the root layout trusts this header to decide whether to
  // skip its DB-backed session check, so it must only ever see proxy-authored
  // values. Without this, sending "x-public-route: 1" by hand (plus any
  // garbage cookie to get past the presence check below) would render
  // protected pages unauthenticated.
  const headers = new Headers(request.headers);
  headers.delete(PUBLIC_ROUTE_HEADER);

  // 공개 공유 호스트(ngrok 고정 도메인)로 온 요청은 공유 경로만 통과시키고
  // 나머지는 404로 막는다 — 로그인/대시보드/내부 API의 존재조차 드러내지 않는다.
  // SHARE_BASE_URL 미설정이면 이 게이트는 완전히 비활성(모든 호스트 기존 동작).
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (isShareHostRequest(requestHost) && !isAllowedShareOnlyPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  if (isPublicPath(pathname)) {
    // Tell the root layout this route must stay reachable without a session,
    // so it skips the real (DB-backed) check for /login and /share/*.
    headers.set(PUBLIC_ROUTE_HEADER, "1");
    return NextResponse.next({ request: { headers } });
  }

  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
