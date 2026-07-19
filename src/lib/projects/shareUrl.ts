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
  return raw.replace(/\/+$/, "");
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

export function isShareHostRequest(
  requestHost: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const shareHost = resolveShareHost(env);
  return shareHost !== null && requestHost === shareHost;
}

const SHARE_ALLOWED_EXACT = new Set(["/share", "/api/share"]);
const SHARE_ALLOWED_PREFIXES = ["/share/", "/api/share/"];

// 공개 공유 호스트에서 통과시킬 경로(공유 페이지 + 공유 API). 그 외는 proxy가 404.
export function isAllowedShareOnlyPath(pathname: string): boolean {
  if (SHARE_ALLOWED_EXACT.has(pathname)) return true;
  return SHARE_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
