import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PUBLIC_ROUTE_HEADER, SESSION_COOKIE_NAME, isPublicPath } from "@/lib/auth/constants";

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

  if (isPublicPath(pathname)) {
    // Tell the root layout this route must stay reachable without a session,
    // so it skips the real (DB-backed) check for /login and /share/*.
    const headers = new Headers(request.headers);
    headers.set(PUBLIC_ROUTE_HEADER, "1");
    return NextResponse.next({ request: { headers } });
  }

  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
