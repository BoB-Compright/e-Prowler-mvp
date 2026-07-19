import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const SHARE_HOST = "myname.ngrok-free.app";

function req(
  host: string,
  path: string,
  cookie?: string,
  forwardedHost?: string,
): NextRequest {
  const headers: Record<string, string> = { host };
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
