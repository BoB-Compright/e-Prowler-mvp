// No dependency on better-sqlite3 (or anything that transitively pulls it in)
// on purpose: this module is imported by src/proxy.ts, which runs through a
// separate bundling pipeline where a native addon like better-sqlite3 can't
// be relied on to bundle correctly (see docs/adr/0001-authentication-local-accounts.md).

export const SESSION_COOKIE_NAME = "nhg_session";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Request header set by src/proxy.ts so the root layout (which runs the real,
// DB-backed session check) knows whether the current request is for a route
// that must stay reachable without a session.
export const PUBLIC_ROUTE_HEADER = "x-public-route";

// Exact page/API paths that never require a session.
const PUBLIC_EXACT_PATHS = new Set(["/login", "/api/auth/login", "/share-blocked"]);

// Path prefixes that never require a session (share links and their API).
const PUBLIC_PATH_PREFIXES = ["/share/", "/api/share/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
