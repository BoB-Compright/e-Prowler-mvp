# 안정적 PM 공유 URL (ngrok 고정 도메인 + 공유 전용 노출) 설계

날짜: 2026-07-19
상태: 사용자 검토 대기

## 배경 / 문제

PM 공유는 두 가지가 동시에 필요하다.

1. **안 바뀌는 링크** — 링크가 바뀔 때마다 PM에게 다시 전달하는 건 실제 업무상 불가.
2. **라이브 반영** — 점검자가 재점검하면 조치 결과가 그 링크에서 그대로 갱신돼야 함.

현재는 로컬 SQLite + Cloudflare quick tunnel이라 (a) 터널 URL이 실행할 때마다 랜덤으로
바뀌고 (b) 서버/터널이 꺼지면 접근 불가다. 공유 링크는 접속한 사람의 origin을 그대로
따르므로(의도된 동작), 점검자가 localhost로 접속하면 링크에 localhost가 박힌다.

## 결정 (사용자 확정)

- **데이터 위치**: 각 점검자 노트북의 로컬 SQLite 유지(온프레미스). 중앙 인스턴스로 옮기지 않음.
- **고정 URL 확보**: 회사 도메인이 없으므로 Cloudflare named tunnel은 불가. 자기 도메인 없이
  고정 URL을 주는 **ngrok 고정 도메인**(무료 계정당 `xxx.ngrok-free.app` 1개)을 쓴다.
  실행할 때마다 URL이 유지된다.
- **점검자별**: 점검자마다 자기 ngrok 계정 → 자기 고정 도메인. 3명 = 고정 URL 3개.
- **실행 방식**: 수동 실행(상시 서비스 등록 아님). 공유가 필요한 동안 점검자가 켠다.
- **노출 범위**: 공유 페이지만. 로그인·대시보드·내부 API는 터널로 접근 불가.
- **노출 강제 위치**: ngrok의 path 필터에 의존하지 않고 **앱 레이어(`src/proxy.ts`)에서 Host 기반
  allowlist**로 강제한다(제품 무관, 단위 테스트 가능).

## 남는 한계 (문서에 명시)

- 노트북/터널이 꺼진 시간에는 열람 불가. **URL은 그대로**라 PM에게 재전달은 불필요하고,
  점검자가 다시 켜면 같은 주소에서 최신 상태가 보인다. "노트북 호스팅 + 수동 실행"을 택한 이상
  남는 근본 한계.
- ngrok 무료 도메인은 브라우저 첫 방문 시 경고 인터스티셜("Visit Site" 1회 클릭)이 뜬다.
  PM에게 안내 문구로 커버한다.

## 아키텍처

```
[PM 브라우저] --https--> [ngrok edge: name.ngrok-free.app]
                              |  (Host: name.ngrok-free.app 유지)
                              v
                     [점검자 노트북 localhost:3000]
                              |
                     [src/proxy.ts]  ── Host가 공개 공유 호스트면
                              |          /share·/api/share·정적만 통과, 그 외 404
                              v
                     [Next 라우트 + 로컬 SQLite]  ── 재점검이 즉시 반영(라이브)

[점검자 본인] --http--> localhost:3000  (전체 앱 사용 — 제한 없음)
```

## 컴포넌트 / 변경

### 1. `src/lib/projects/shareUrl.ts` (복구 + 재사용)

리버트됐던 유틸을 복구한다(커밋 57d36f8에서 제거된 것).

- `resolveShareBaseUrl(env = process.env): string | null` — `SHARE_BASE_URL`을 trim하고
  뒤 슬래시 제거, 비어 있으면 `null`.
- `buildShareUrl(baseUrl, token): string` → `${baseUrl}/share/${token}`.
- 단위 테스트 복구(고정 값·공백·뒤 슬래시·null 케이스).

### 2. 링크 생성 연동 (복구)

- `ShareLinkPanel.tsx`: `setShareUrl(buildShareUrl(shareBaseUrl ?? window.location.origin, token))`.
  `shareBaseUrl` prop 추가, 의존성 배열에 포함.
- `projects/[id]/page.tsx`: `shareBaseUrl={resolveShareBaseUrl()}` 전달.
- 효과: `SHARE_BASE_URL`이 설정되면 복사·QR·메일 링크가 모두 그 고정 도메인으로 생성된다.
  미설정 시 기존처럼 origin 폴백(하위 호환).

### 3. `src/proxy.ts` — Host 기반 공유 전용 allowlist (신규 동작)

핵심 로직. 요청이 **공개 공유 호스트**로 들어오면 공유에 필요한 경로만 허용하고 나머지는 404.

- 공개 공유 호스트 = `resolveShareBaseUrl()`의 호스트명(`new URL(SHARE_BASE_URL).host`).
  `SHARE_BASE_URL` 미설정이면 이 게이트는 완전히 비활성(모든 호스트가 기존 동작 — 하위 호환).
- 요청 호스트 = `x-forwarded-host` ?? `host` 헤더(ngrok은 원본 Host를 유지·전달).
- 요청 호스트 == 공개 공유 호스트이고, 경로가 공유 허용 경로가 **아니면** → `404`(NextResponse,
  본문 없음). 로그인/대시보드/내부 API의 존재를 드러내지 않기 위해 redirect(→/login)나 401이
  아니라 404로 응답한다.
- 공유 허용 경로: `/share`, `/share/**`, `/api/share`, `/api/share/**`.
  (정적 자산 `_next/static`·`favicon.ico`는 기존 matcher가 이미 proxy 대상에서 제외.)
- 공유 허용 경로는 기존 `isPublicPath` 흐름을 그대로 타서 세션 없이 렌더된다.
- localhost 등 다른 호스트: 기존 동작 100% 유지(로그인 게이트·쿠키 검사·리다이렉트).

주의: `/login`은 앱 관점에선 공개 경로지만, **공개 공유 호스트에서는 404**여야 한다. 따라서
Host 게이트가 `isPublicPath`보다 먼저 판정한다.

### 4. `.env.example`

`SHARE_BASE_URL` 항목 복구 + ngrok 맥락 설명(예: `https://myname.ngrok-free.app`).

### 5. 문서 `docs/ops/share-ngrok.md` (신규)

점검자 셋업 절차: ngrok 무료 가입 → 고정 도메인 확보(대시보드에서 발급) → authtoken 설정 →
`.env`에 `SHARE_BASE_URL=https://<도메인>` → 서버 기동 → `ngrok http --url=<도메인> 3000`(수동) →
검증(공유 링크 200 / `/login`·`/api/assets` 404). 한계·인터스티셜 안내 포함.

### 6. `README.md`

공유 섹션을 ngrok 고정 URL + 공유 전용 노출 기준으로 갱신, 문서 링크 추가.

## 데이터 흐름 (라이브 반영)

1. PM이 `https://name.ngrok-free.app/share/<token>` 접속.
2. ngrok edge → localhost:3000, proxy가 Host 확인 → 공유 경로 허용.
3. ShareGate 비밀번호 검증(`/api/share/<token>`, 5회 실패 15분 잠금은 기존 로직) → 로컬 SQLite에서
   현재 리포트 렌더.
4. 점검자가 localhost로 재점검 → 같은 SQLite 갱신 → PM이 새로고침하면 최신 조치 반영.

## 오류 / 보안

- 공개 공유 호스트에서 공유 외 경로는 404(존재 은폐). proxy의 `PUBLIC_ROUTE_HEADER` strip 유지.
- 공유 자체는 기존 비밀번호(5회 실패 15분 잠금)로 보호. 인터넷 노출이므로 문서에서 강한 공유
  비밀번호·사용 후 터널 종료 권고.
- 관리자 로그인은 터널로 도달 불가(404)라, 터널이 떠 있어도 관리 기능은 인터넷에 노출되지 않음.

## 테스트

- `shareUrl.test.ts`(복구): 고정 값·공백·뒤 슬래시·null.
- `proxy.test.ts`(신규): 공개 호스트 + `/share/x`→통과, `/api/share/x`→통과, `/login`→404,
  `/`(대시보드)→404, `/api/assets`→404; localhost + `/login`→통과, 쿠키 없는 `/`→`/login` 리다이렉트;
  `SHARE_BASE_URL` 미설정 시 모든 호스트 기존 동작.
- 실검증: 실제 ngrok 고정 도메인으로 공유 링크 열람 성공 + `/login`·내부 API 404 확인(점검자
  authtoken 필요 — 셋업 후 수행).

## 범위 외

- 상시 서비스 등록(자동 시작), 중앙/공유 DB 인스턴스, 이메일 SMTP 직접 발송(#81 옵션 B),
  Tailscale 등 대체 제품(코드는 제품 무관이라 필요 시 문서만 추가).
