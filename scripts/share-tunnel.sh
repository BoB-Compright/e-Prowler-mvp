#!/usr/bin/env bash
# NH-Guardian 외부 공유용 Cloudflare 임시 터널 (#81)
#
# 점검자가 이 스크립트를 실행하면 계정·도메인 없이 임시 공개 URL
# (https://<랜덤>.trycloudflare.com)이 발급된다. 점검자가 "그 URL로" 앱에
# 접속해 로그인하고 공유(복사·QR·메일)하면, 공유 링크는 접속 주소를 그대로
# 따라가므로 자동으로 터널 주소가 된다 — 점검자마다 자기 터널, 자기 링크.
#
# 터널을 끄면(Ctrl+C) 외부 접근도 즉시 끊긴다. URL은 실행할 때마다 바뀐다.
set -euo pipefail

PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared가 없습니다. 설치: brew install cloudflared" >&2
  exit 1
fi

if ! curl -s -o /dev/null "http://localhost:${PORT}/login"; then
  echo "localhost:${PORT} 에 NH-Guardian 서버가 떠 있지 않습니다. 먼저 npm run start 하세요." >&2
  exit 1
fi

echo "Cloudflare 임시 터널을 엽니다 (localhost:${PORT} → 인터넷)..."
echo "아래 로그에 표시되는 https://*.trycloudflare.com 주소로 접속해 로그인 후 공유하세요."
echo "터널을 종료하려면 Ctrl+C — 종료 즉시 외부 접근이 끊깁니다."
echo
exec cloudflared tunnel --url "http://localhost:${PORT}"
