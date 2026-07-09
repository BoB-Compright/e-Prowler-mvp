import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { invalidateSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  invalidateSession(token);

  const res = NextResponse.json({ ok: true });
  // Same attribute set as the login route's Set-Cookie — differing flags
  // (secure in particular) can make browsers treat this as a different
  // cookie and leave the real session cookie in place instead of clearing it.
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  return res;
}
