// 공유 링크의 고정 베이스 URL (#81 후속): 담당자가 localhost로 접속해 있어도
// 메일·QR·복사에 담기는 주소는 PM이 실제로 열 수 있는 주소여야 한다.
// SHARE_BASE_URL이 설정돼 있으면 그 값을 쓰고, 없으면 호출부가
// window.location.origin으로 폴백한다. 서버 컴포넌트에서 요청 시점에 읽으므로
// 빌드 없이 .env 변경 + 재기동만으로 반영된다.
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
