// 공유 링크의 고정 베이스 URL (#81 후속): 점검자가 localhost로 접속·작업해도
// 복사·QR·메일에 담기는 주소는 PM이 실제로 열 수 있는 고정 주소(ngrok 도메인)여야
// 한다. SHARE_BASE_URL이 설정돼 있으면 그 값을 쓰고, 없으면 호출부가
// window.location.origin으로 폴백한다. 이 모듈은 무거운 import가 없어 proxy(미들웨어)에서
// 안전하게 재사용된다 — 공개 공유 호스트 판별에도 쓰인다.

export function resolveShareBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.SHARE_BASE_URL?.trim();
  if (!raw) return null;
  // 운영자가 스킴 없이 값을 넣어도(예: "myname.ngrok-free.app") new URL()이 던지지 않도록
  // https://를 보정한다 — 스킴 누락은 게이트를 fail-open으로 만들고 공유 링크도 깨뜨린다.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

export function buildShareUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/share/${token}`;
}

// SHARE_BASE_URL의 호스트명. proxy가 "이 요청이 공개 공유 호스트로 온 것인가"를
// 판정하는 기준. 미설정·파싱 실패 시 null(= 게이트 비활성).
export function resolveShareHost(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const base = resolveShareBaseUrl(env);
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

// 공개 공유 호스트 판별. fail-closed: host 또는 x-forwarded-host 중 하나라도 공유
// 호스트면 공개 요청으로 본다 — 클라이언트가 위조 가능한 x-forwarded-host로는
// 게이트를 우회(제거)할 수 없고, 오직 제한을 더할 수만 있다.
export function isOnShareHost(
  hostHeader: string | null,
  forwardedHost: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const shareHost = resolveShareHost(env);
  if (!shareHost) return false;
  return hostHeader === shareHost || forwardedHost === shareHost;
}

const SHARE_ALLOWED_PREFIXES = ["/share/", "/api/share/"];

// 공개 공유 호스트에서 통과시킬 경로(토큰을 동반한 공유 페이지 + 공유 API만).
// 토큰 없는 bare "/share", "/api/share"는 실제 라우트가 없으므로 허용하지
// 않는다 — 허용하면 게이트를 통과해 로그인/인증 API 로직까지 흘러가
// 307(/login 리다이렉트)·401을 반환하며 그 존재를 노출한다. 그 외는 proxy가 404.
export function isAllowedShareOnlyPath(pathname: string): boolean {
  return SHARE_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// 공유 뷰(미니멀 공개 셸로 렌더할 경로) 판별. 오매칭 방지를 위해 정확히 매칭한다:
// /share, /share/**, 그리고 안내 페이지 /share-blocked. (/sharewolf, /api/share/* 제외)
export function isShareViewPath(pathname: string): boolean {
  return pathname === "/share" || pathname.startsWith("/share/") || pathname === "/share-blocked";
}
