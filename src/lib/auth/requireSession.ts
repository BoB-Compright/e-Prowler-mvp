import type { Database } from "better-sqlite3";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "./constants";
import { verifySession, type Session } from "./session";

// Route-handler helper performing the *real* (DB-backed) session check —
// unlike src/proxy.ts, which only checks whether the cookie is present (see
// docs/adr/0001-authentication-local-accounts.md, section 4). Not wired into
// any existing route handler: this is for new protected API routes only, so
// existing route-handler unit tests (which call handlers directly, without a
// session) keep passing.
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
