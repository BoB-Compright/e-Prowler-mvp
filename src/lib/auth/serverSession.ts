import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "./constants";
import { verifySession, type Session } from "./session";

// Real (DB-backed) session lookup for Server Components — the second tier of
// the guard described in docs/adr/0001-authentication-local-accounts.md,
// section 4. Non-throwing: used on public routes (/login, /share/*) where a
// signed-in user may still be browsing, purely to decide whether to render
// the header's profile block.
export async function getSessionUserFromCookies(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token);
}

// Same lookup, but redirects to /login when there's no valid session. This is
// the real enforcement for protected pages (src/proxy.ts only checked cookie
// presence) — called from the root layout for every route that isn't marked
// public via the x-public-route request header.
export async function requireSessionUserOrRedirect(): Promise<Session> {
  const session = await getSessionUserFromCookies();
  if (!session) {
    redirect("/login");
  }
  return session;
}
