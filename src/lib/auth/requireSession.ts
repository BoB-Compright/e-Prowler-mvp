import type { Database } from "better-sqlite3";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "./constants";
import { verifySession, type Session } from "./session";

// Route-handler helper performing the *real* (DB-backed) session check —
// unlike src/proxy.ts, which only checks whether the cookie is present (see
// docs/adr/0001-authentication-local-accounts.md, section 4). Use this form
// when the handler also needs the session's user; for a plain guard use
// requireApiSession below.
export function requireSession(
  request: NextRequest,
  db: Database = getDb(),
): { session: Session } | { unauthorized: NextResponse } {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySession(token, db);
  if (!session) {
    return { unauthorized: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { session };
}

// Parses the raw Cookie header instead of NextRequest#cookies so this works
// for both real requests and the plain `Request` stand-ins used by the route
// unit tests in this repo.
function sessionTokenFromCookieHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

// Guard for protected API route handlers: returns a 401 JSON response when
// the request has no valid (DB-backed, unexpired) session, or null to let
// the handler proceed. Must be the FIRST statement of every protected API
// handler — src/proxy.ts only checks cookie *presence*, so a forged cookie
// gets past it; this is the check that actually stops it.
//
//   const unauthorized = requireApiSession(req);
//   if (unauthorized) return unauthorized;
export function requireApiSession(
  request: Pick<Request, "headers">,
  db: Database = getDb(),
): NextResponse | null {
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  if (!verifySession(token, db)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
