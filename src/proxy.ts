import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  PUBLIC_ROUTE_HEADER,
  SESSION_COOKIE_NAME,
  SHARE_VIEW_HEADER,
  isPublicPath,
} from "@/lib/auth/constants";
import { isOnShareHost, isAllowedShareOnlyPath, isShareViewPath } from "@/lib/projects/shareUrl";

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

  // 클라이언트가 보낸 x-share-view를 먼저 제거(레이아웃이 신뢰하는 헤더) 후,
  // 공유 뷰 경로에만 프록시가 직접 세팅한다 — 레이아웃은 이 헤더로 미니멀 셸을 고른다.
  headers.delete(SHARE_VIEW_HEADER);
  if (isShareViewPath(pathname)) {
    headers.set(SHARE_VIEW_HEADER, "1");
  }

  // 공개 공유 호스트(ngrok 고정 도메인)로 온 요청은 공유 경로만 통과시키고
  // 나머지는 404로 막는다 — 로그인/대시보드/내부 API의 존재조차 드러내지 않는다.
  // host 또는 x-forwarded-host 중 하나라도 공유 호스트면 게이트 발동(fail-closed):
  // 위조 가능한 x-forwarded-host로는 우회 불가. SHARE_BASE_URL 미설정 시 완전 비활성.
  if (
    isOnShareHost(request.headers.get("host"), request.headers.get("x-forwarded-host")) &&
    !isAllowedShareOnlyPath(pathname)
  ) {
    // bare 404 대신 친절한 안내 페이지로 rewrite(상태 404 유지 — 라우트 존재는 은폐).
    // 안내 페이지도 미니멀 셸이어야 하므로 x-share-view/public 헤더를 세팅해 전달한다.
    headers.set(SHARE_VIEW_HEADER, "1");
    headers.set(PUBLIC_ROUTE_HEADER, "1");
    return NextResponse.rewrite(new URL("/share-blocked", request.url), {
      status: 404,
      request: { headers },
    });
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
