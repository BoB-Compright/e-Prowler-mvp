# PM 공유 링크 외부(인터넷) 공개 — Cloudflare Tunnel 가이드

PM이 사내망 밖(인터넷)에서 공유 링크를 열 수 있게, 고정 도메인으로 NH-Guardian의
**공유 화면만** 노출하는 절차. 서버 자체는 온프레미스에 그대로 두고, 아웃바운드
터널만 사용하므로 방화벽 인바운드 개방이 필요 없다.

## 노출 범위 (보안 원칙)

터널은 [`deploy/cloudflared/config.example.yml`](../../deploy/cloudflared/config.example.yml)의
ingress 규칙에 따라 아래 경로만 통과시킨다. 로그인·대시보드·자산/점검/CVE API 등
내부 기능은 인터넷에서 전부 404다.

| 경로 | 용도 |
|---|---|
| `/share/*` | PM 공유 화면(비밀번호 게이트 + 읽기 전용 리포트) |
| `/api/share/*` | 공유 비밀번호 검증(5회 실패 15분 잠금은 앱이 처리) |
| `/_next/static/*`, `/favicon.ico` | 페이지 렌더링용 정적 자산 |

## 사전 준비

- Cloudflare 계정 + Cloudflare에 등록된 도메인(네임서버 연결 완료)
- `cloudflared` CLI (`brew install cloudflared`)

## 절차

```bash
# 1. Cloudflare 계정 인증 (브라우저가 열림 — 터널을 연결할 도메인을 선택)
cloudflared tunnel login

# 2. 터널 생성 — <TUNNEL_ID>가 출력되고 자격증명 json이 ~/.cloudflared/에 생성됨
cloudflared tunnel create nh-guardian-share

# 3. 공유용 서브도메인을 터널에 연결 (예: share.example.com)
cloudflared tunnel route dns nh-guardian-share share.example.com

# 4. ingress 설정 복사 후 <TUNNEL_ID>와 hostname을 실제 값으로 수정
cp deploy/cloudflared/config.example.yml ~/.cloudflared/config.yml

# 5. 터널 기동 (NH-Guardian 서버와 함께 상시 실행)
cloudflared tunnel run nh-guardian-share
```

## NH-Guardian 설정

`.env`에 공유 링크 고정 주소를 터널 도메인으로 지정하고 서버를 재기동한다
(재빌드 불필요 — 요청 시점에 읽는다):

```
SHARE_BASE_URL=https://share.example.com
```

이후 프로젝트 화면의 공유 링크(복사·QR·메일 본문)가 모두
`https://share.example.com/share/<token>` 으로 만들어진다.

## 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://share.example.com/share/유효토큰   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://share.example.com/login          # 404 (차단 확인)
curl -s -o /dev/null -w "%{http_code}\n" https://share.example.com/api/assets     # 404 (차단 확인)
```

## 주의

- 공유 화면은 비밀번호(5회 실패 15분 잠금)로 보호되지만, 인터넷 노출인 만큼
  공유 비밀번호는 추측하기 어려운 값으로 쓰고 필요 시 링크를 폐기·재발급한다.
- 터널을 내리면(`Ctrl+C`) 외부 접근도 즉시 끊긴다 — 시연·공유 기간에만 켜는 운용도 가능.
