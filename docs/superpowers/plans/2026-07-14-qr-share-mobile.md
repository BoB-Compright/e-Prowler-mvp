# QR 참여형 공유 + 모바일 리포트 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PM 공유 링크를 발표용 QR로 띄우고(청중 스캔→기존 비번 게이트), 청중이 모바일에서 공유 리포트를 보기 좋게 만든다.

**Architecture:** ShareLinkPanel(이미 shareUrl 보유)에 qrcode 동적 import로 QR 이미지 토글 추가. ShareGate는 기존 반응형에 모바일 정독성 폴리시. 부하는 1회 fetch라 코드 변경 없음(안내만).

**Tech Stack:** Next.js 16 App Router, TypeScript, qrcode(클라이언트 동적 import), Tailwind v4.

## Global Constraints

- 테스트/타입/린트는 Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` 후 npx.
- QR엔 공유 URL만(비번은 해시라 표시 불가). QR 버튼은 공유 상태 active일 때만.
- qrcode는 **클라이언트 동적 import**(`await import("qrcode")`)로 최초 열 때만 로드 — 초기 번들 영향 없음. data URL 사용(CSP 안전, 외부 호출 없음).
- 컴포넌트 테스트 인프라 없음 — UI는 tsc/eslint/next build + 수동(모바일 뷰포트).

---

### Task 1: ShareLinkPanel에 발표용 QR

**Files:**
- Modify: `src/app/projects/[id]/ShareLinkPanel.tsx`

**Interfaces:** Consumes 기존 `shareUrl`/`status` 상태, `qrcode`(동적 import).

- [ ] **Step 1: QR 상태·토글·생성 추가**

`src/app/projects/[id]/ShareLinkPanel.tsx`의 컴포넌트 상태 선언부(기존 `const [copied, setCopied] = ...` 근처)에 추가:

```tsx
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
```

토글 핸들러 추가(컴포넌트 함수 본문, 기존 핸들러들 옆):

```tsx
  async function toggleQr() {
    if (qrOpen) {
      setQrOpen(false);
      return;
    }
    setQrOpen(true);
    setQrError(null);
    if (!qrDataUrl && shareUrl) {
      try {
        // 최초 열 때만 qrcode 로드(초기 번들 제외). data URL이라 외부 호출 없음(CSP 안전).
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(shareUrl, { width: 320, margin: 2 });
        setQrDataUrl(url);
      } catch {
        setQrError("QR 생성에 실패했습니다");
      }
    }
  }
```

- [ ] **Step 2: "PM 공유 링크" 블록 아래에 QR 영역 렌더**

`src/app/projects/[id]/ShareLinkPanel.tsx`에서 "PM 공유 링크" `<div>...</div>` 블록(복사 버튼 포함, 약 142~162행)
바로 **다음**에 아래를 추가한다. 공유 상태가 active일 때만 노출:

```tsx
        {status === "active" && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className={labelClass}>발표용 QR</p>
              <button
                type="button"
                onClick={toggleQr}
                className={secondaryButtonClass}
                aria-expanded={qrOpen}
              >
                {qrOpen ? "QR 접기" : "발표용 QR 표시"}
              </button>
            </div>
            {qrOpen && (
              <div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-border bg-bg p-4">
                {qrError ? (
                  <p className="text-[13px] text-fail">{qrError}</p>
                ) : qrDataUrl ? (
                  <>
                    {/* data URL 이미지 — 청중이 스캔해 공유 리포트로 이동한다. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="공유 링크 QR 코드" width={256} height={256} className="h-64 w-64" />
                    <p className="font-mono text-[12px] break-all text-center text-muted">{shareUrl}</p>
                    <p className="max-w-[360px] text-center text-[12px] text-muted">
                      청중이 스캔한 뒤 비밀번호를 입력합니다. 비밀번호를 정확히 안내하세요. 링크가 잠기면 아래
                      &lsquo;재발급&rsquo;으로 복구할 수 있습니다.
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted">QR 생성 중…</p>
                )}
              </div>
            )}
          </div>
        )}
```

주의: 실제 파일에서 "PM 공유 링크" 블록의 정확한 닫는 `</div>` 위치를 읽고 그 뒤에 삽입한다. `labelClass`/
`secondaryButtonClass`/`status`/`shareUrl`는 이미 이 파일에 있다.

- [ ] **Step 3: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/projects/[id]/ShareLinkPanel.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add "src/app/projects/[id]/ShareLinkPanel.tsx"
git commit -m "feat: 공유 설정에 발표용 QR(공유 URL, qrcode 동적 import·data URL) + 안내"
```

---

### Task 2: 공유 리포트 모바일 정독성 폴리시 (ShareGate)

**Files:**
- Modify: `src/app/share/[token]/ShareGate.tsx`

**Interfaces:** 없음(반응형 CSS 폴리시).

- [ ] **Step 1: 모바일 정독성 targeted 폴리시**

`src/app/share/[token]/ShareGate.tsx`에서 아래를 적용한다(구조·데이터 로직 불변, 반응형 클래스만):

1. 제목 크기 모바일 축소: 헤더 `<h1 className="text-[26px] font-bold tracking-[-0.02em]">`를
   `<h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.02em]">`로.
2. 자산 테이블이 페이지를 넘치지 않도록: 테이블을 감싼 `<div className="overflow-x-auto">`에
   `-mx-1 px-1`은 두지 말고, 필요 시 `<div className="overflow-x-auto">` 유지(이미 있음). 테이블에
   `min-w-[520px]`를 부여해 모바일에서 컨테이너 안에서만 가로 스크롤되게 한다(페이지 자체는 안 넘침):
   `<table className="w-full min-w-[520px] text-left text-sm">`.
3. "조치가 필요한 항목" 카드 내 긴 텍스트 줄바꿈: 항목 제목/설명 문단에 `break-words`가 없으면 추가,
   코드블록 `<pre>`는 이미 `overflow-x-auto`이므로 유지.
4. 최상위 반환 컨테이너(page.tsx의 `<main class="... max-w-[1440px] px-4 ...">`)는 그대로. ShareGate 루트
   `<div>`가 넘치지 않도록, findings/자산 카드 그리드는 기존 `grid-cols-1 lg:grid-cols-3`(모바일 스택) 유지.

실제 파일의 해당 위치(헤더 h1, 자산 테이블 `<table>`, findings 문단)를 읽어 위 클래스만 정확히 반영한다.
과한 구조 변경(테이블→카드 변환 등)은 하지 않는다.

- [ ] **Step 2: 정적 검증 + 빌드 + 커밋**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx eslint "src/app/share/[token]/ShareGate.tsx" && npx next build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

```bash
git add "src/app/share/[token]/ShareGate.tsx"
git commit -m "feat: 공유 리포트 모바일 정독성 폴리시(제목·테이블 스크롤·줄바꿈)"
```

---

## 실행 후(병합 전) 컨트롤러 — 수동 확인 + 배포
- 데스크톱: 프로젝트 상세 → 공유 설정 → "발표용 QR 표시" → QR·URL·안내 확인.
- 모바일(브라우저 뷰포트 375px 또는 실제 폰으로 QR 스캔): 공유 리포트가 가로 오버플로우 없이 읽히고,
  "조치가 필요한 항목"이 잘 보이는지 확인.
- 프로덕션 재빌드·재기동(TZ=Asia/Seoul).
