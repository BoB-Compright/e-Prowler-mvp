import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const SHARE_HOST = "myname.ngrok-free.app";

function req(
  host: string,
  path: string,
  cookie?: string,
  forwardedHost?: string,
  extraHeaders?: Record<string, string>,
): NextRequest {
  const headers: Record<string, string> = { host, ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  if (forwardedHost) headers["x-forwarded-host"] = forwardedHost;
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

  it("404s bare /share and /api/share (no token) — must not leak login/API existence", () => {
    expect(proxy(req(SHARE_HOST, "/share")).status).toBe(404);
    expect(proxy(req(SHARE_HOST, "/api/share")).status).toBe(404);
    expect(proxy(req(SHARE_HOST, "/api/shareX")).status).toBe(404);
    expect(proxy(req(SHARE_HOST, "/sharewolf")).status).toBe(404);
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

  it("gates on x-forwarded-host matching the share host even when host does not match", () => {
    expect(proxy(req("localhost:3000", "/login", undefined, SHARE_HOST)).status).toBe(404);
  });

  it("C1: does not let a spoofed x-forwarded-host bypass the gate when Host is the share host", () => {
    // Host는 공유 호스트지만 x-forwarded-host가 위조된 값 — 게이트는 fail-closed로 여전히 발동해야 한다.
    expect(proxy(req(SHARE_HOST, "/login", undefined, "evil.example")).status).toBe(404);
  });

  it("gates correctly even when SHARE_BASE_URL has no scheme", () => {
    process.env.SHARE_BASE_URL = SHARE_HOST; // no https:// prefix
    expect(proxy(req(SHARE_HOST, "/login")).status).toBe(404);
  });

  it("rewrites blocked paths on the share host to /share-blocked (404)", () => {
    const res = proxy(req(SHARE_HOST, "/login"));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/share-blocked");
  });

  it("still allows /share-blocked itself on the share host", () => {
    expect(proxy(req(SHARE_HOST, "/share-blocked")).status).toBe(200);
  });
});

describe("proxy x-share-view strip/set behavior", () => {
  // proxy forwards request headers via NextResponse.next({ request: { headers } }).
  // Next encodes any overridden request header on the RESPONSE as
  // "x-middleware-request-<name>", plus a summary list in
  // "x-middleware-override-headers". A header only shows up there if the
  // outgoing (forwarded) value differs from what the client sent — so an
  // absent/empty read here means "not forwarded as an override", which is
  // exactly what we want to assert for the strip cases.
  const FORWARDED_SHARE_VIEW = "x-middleware-request-x-share-view";

  it("sets x-share-view=1 on the forwarded request for a share-view path", () => {
    const res = proxy(req("localhost:3000", "/share/abc"));
    expect(res.headers.get(FORWARDED_SHARE_VIEW)).toBe("1");
  });

  it("strips a client-supplied x-share-view on an admin path (not forwarded as 1)", () => {
    const res = proxy(
      req("localhost:3000", "/", SESSION_COOKIE_NAME + "=anything", undefined, {
        "x-share-view": "1",
      }),
    );
    // Reaches the authenticated next() path (has a session cookie), not a redirect.
    expect(res.status).toBe(200);
    expect(res.headers.get(FORWARDED_SHARE_VIEW)).not.toBe("1");
    expect(res.headers.get(FORWARDED_SHARE_VIEW)).toBeFalsy();
  });

  it("does not set x-share-view on a non-share public path (/login)", () => {
    const res = proxy(req("localhost:3000", "/login"));
    expect(res.headers.get(FORWARDED_SHARE_VIEW)).toBeFalsy();
  });
});
