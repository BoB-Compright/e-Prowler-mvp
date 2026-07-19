# PM 공유 링크 외부 공개 — ngrok 고정 도메인 가이드

PM이 사내망 밖에서도 열 수 있는 **안 바뀌는 공유 링크**를 만드는 절차. 서버는 점검자
노트북에 그대로 두고, ngrok 고정 도메인으로 공유 화면만 인터넷에 노출한다. 점검자마다
자기 ngrok 계정 → 자기 고정 도메인이라 여러 명이 각자 링크를 갖는다.

## 동작 요약

- 링크는 재실행해도 안 바뀐다(ngrok 고정 도메인 + 프로젝트 공유 토큰). PM에게 한 번만 전달.
- 점검자가 재점검하면 같은 링크에서 최신 조치가 그대로 보인다(로컬 DB 라이브 서빙).
- 공개 도메인으로는 `/share`·`/api/share`만 열린다. 로그인·대시보드·내부 API는 404.
- 다만 이 404는 라우트·API를 가릴 뿐, 정적 클라이언트 번들(`/_next/static`)은 여전히
  받아질 수 있다 — 실질적 보호는 관리자 로그인과 공유 비밀번호(다중 방어선)다.
- 노트북/터널이 꺼진 동안은 열람 불가(주소는 그대로). 공유가 필요할 때 켠다(수동 실행).
- `SHARE_BASE_URL`은 build-time 값이다 — 도메인을 `.env`에 넣고 빌드해야 하며, 바꾸면 재빌드한다(아래 절차 참고).

## 사전 준비

- [ngrok](https://ngrok.com) 무료 가입 → 대시보드에서 **고정 도메인(Domain) 1개 발급**
  (무료 플랜 계정당 1개, 예: `myname.ngrok-free.app`).
- `ngrok` CLI 설치(`brew install ngrok`) 후 authtoken 등록:
  `ngrok config add-authtoken <토큰>` — 대시보드에서 authtoken을 복사해 이 명령을 **본인 터미널에서**
  한 번 실행하면 로컬 설정에 저장된다(웹 승인만으로 되는 방식이 아니며, 이후엔 재등록 불필요).

## 절차

> **중요:** `SHARE_BASE_URL`은 **빌드 시점에 번들로 굳는(build-time) 값**이다. 반드시 도메인을
> `.env`에 먼저 넣고 `npm run build`를 해야 공유 전용 게이트와 링크 생성이 그 도메인으로 동작한다.
> 값을 넣지 않고 빌드하면 게이트가 아예 비활성(모든 경로 통과)되니 주의한다. **도메인이 바뀌면
> 다시 빌드해야 한다.** (점검자마다 자기 노트북에서 한 번 빌드하면 되므로 실사용엔 문제없다.
> 이 build-time 동작은 프로덕션 `npm run start` 경로 기준으로 실측 확인됐다.)

```bash
# 1. .env에 발급받은 고정 도메인을 지정 (앞에 https://)
#    SHARE_BASE_URL=https://myname.ngrok-free.app

# 2. 도메인을 실어서 빌드 (build-time에 인라인됨 — 이 단계를 건너뛰면 게이트가 안 붙는다)
npm run build

# 3. 서버 기동 (.env를 실어서 — AI/번역 동작 위해)
npm run start

# 4. 고정 도메인으로 localhost:3000 노출 (수동, 공유가 필요한 동안 켜 둠)
ngrok http 3000 --url https://myname.ngrok-free.app
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
