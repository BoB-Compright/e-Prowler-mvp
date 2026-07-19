# PM 공유 링크 외부 공개 — ngrok 고정 도메인 가이드

PM이 사내망 밖에서도 열 수 있는 **안 바뀌는 공유 링크**를 만드는 절차. 서버는 점검자
노트북에 그대로 두고, ngrok 고정 도메인으로 공유 화면만 인터넷에 노출한다. 점검자마다
자기 ngrok 계정 → 자기 고정 도메인이라 여러 명이 각자 링크를 갖는다.

## 동작 요약

- 링크는 재실행해도 안 바뀐다(ngrok 고정 도메인 + 프로젝트 공유 토큰). PM에게 한 번만 전달.
- 점검자가 재점검하면 같은 링크에서 최신 조치가 그대로 보인다(로컬 DB 라이브 서빙).
- 공개 도메인으로는 `/share`·`/api/share`만 열린다. 로그인·대시보드·내부 API는 404.
- 노트북/터널이 꺼진 동안은 열람 불가(주소는 그대로). 공유가 필요할 때 켠다(수동 실행).

## 사전 준비

- [ngrok](https://ngrok.com) 무료 가입 → 대시보드에서 **고정 도메인(Domain) 1개 발급**
  (무료 플랜 계정당 1개, 예: `myname.ngrok-free.app`).
- `ngrok` CLI 설치(`brew install ngrok`) 후 authtoken 등록:
  `ngrok config add-authtoken <토큰>`

## 절차

```bash
# 1. .env에 발급받은 고정 도메인을 지정 (앞에 https://)
#    SHARE_BASE_URL=https://myname.ngrok-free.app

# 2. NH-Guardian 서버 기동 (.env를 실어서 — AI/번역 동작 위해)
npm run start

# 3. 고정 도메인으로 localhost:3000 노출 (수동, 공유가 필요한 동안 켜 둠)
ngrok http --url=myname.ngrok-free.app 3000
```

이후 프로젝트 화면의 공유 링크(복사·QR·메일)가 모두
`https://myname.ngrok-free.app/share/<token>` 으로 생성된다.

## 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://myname.ngrok-free.app/share/유효토큰  # 200
curl -s -o /dev/null -w "%{http_code}\n" https://myname.ngrok-free.app/login          # 404
curl -s -o /dev/null -w "%{http_code}\n" https://myname.ngrok-free.app/api/assets     # 404
```

## 주의

- ngrok 무료 도메인은 브라우저 첫 방문 시 경고 페이지가 뜬다. PM에게 "Visit Site"를 한 번
  누르면 된다고 안내한다.
- 공유 화면은 비밀번호(5회 실패 15분 잠금)로 보호되지만 인터넷 노출이므로, 공유 비밀번호는
  추측하기 어려운 값으로 쓰고 공유가 끝나면 터널(ngrok)을 종료한다(Ctrl+C).
- 노트북이 꺼져 있으면(퇴근·절전) 그 시간엔 링크가 열리지 않는다. 링크 주소는 유지되므로
  재전달은 불필요하다.
