# 백로그 이슈 일괄 구현 Implementation Plan (#69~#78)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리스킨 백로그에서 발행한 GitHub 이슈 10건(#69~#78)을 작은 것부터 차례로 전부 구현한다.

**Architecture:** 각 태스크 = 이슈 1건 = 독립적인 수직 슬라이스(스키마→API→UI→테스트). 태스크마다 해당 이슈의 Acceptance criteria가 스펙이다 (`gh issue view <번호>`로 확인). 기존 Kinetic 디자인 시스템(DESIGN.md의 토큰·컴포넌트·레시피)을 그대로 사용한다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, better-sqlite3, vitest, gh CLI.

**사전 결정(사용자 확정):**
- #72: 외부 공유 뷰에 자산별 판정 배지(양호/취약/검토)까지 노출. 세부 취약점 내역·건수는 계속 비노출.
- #78: 자체 계정 최소판 — 로컬 계정(아이디/비밀번호) + 세션 쿠키 + 로그인/로그아웃 + 헤더 프로필 블록. 알림은 후속.

## Global Constraints

- 브랜치 `feature/backlog-issues`에서 작업. 태스크마다 독립 커밋.
- **테스트**: `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 통과 유지(현재 528개). 새 로직은 TDD(실패 테스트 → 구현 → 통과). UI 전용 변경은 기존 테스트 통과 + eslint/tsc로 갈음.
- **디자인**: DESIGN.md의 Kinetic 토큰·공용 컴포넌트(`Card`/`StatusBadge`(pass|fail|review|neutral|progress)/`SectionLabel`)·공통 스타일 레시피(버튼/입력/테이블) 준수. `[var(--color-*)]` 아비트러리 표기 금지(테마 유틸리티 사용).
- **판정 의미론**: 파이프라인 실패(run.status=failed)는 "실패", 취약 outcome은 "취약" — 절대 혼동 금지 (커밋 cc271c9·60ae028의 원칙).
- **스키마 변경**: 기존 DB 파일(data/app.db)과 호환되는 마이그레이션(`ALTER TABLE ... ADD COLUMN` 등, 기존 초기화 코드 패턴 준수). 파괴적 변경 금지.
- 각 태스크 완료 시 해당 이슈의 Acceptance criteria가 전부 충족되어야 한다. 이슈 클로즈는 컨트롤러가 리뷰 통과 후 수행.
- 커밋 메시지 한국어 conventional commit + `(#이슈번호)` 표기, 말미 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 기능 추가 시에도 기존 기능·라우트·API 계약의 회귀 금지.

---

### Task 1: 리포트 화면 재스캔 트리거 (#75)

**Files:**
- Create: `src/app/runs/[id]/report/RescanButton.tsx` (client)
- Modify: `src/app/runs/[id]/report/page.tsx` 또는 `ReportView.tsx` (버튼 배치)
- 참고: `src/app/assets/[id]/StartScanButton.tsx` (기존 스캔 시작 패턴), `src/app/api/assets/[id]/scan` 계열 라우트 — 실제 스캔 시작 API 경로를 코드에서 확인해 동일 경로 재사용

**Interfaces:**
- Produces: `<RescanButton assetId={string} />` — 클릭 시 기존 스캔 시작 API 호출 → 성공 시 `router.push("/runs/" + newRunId)`.

- [ ] Step 1: 기존 StartScanButton과 스캔 API를 읽고 동일 패턴으로 RescanButton 작성 (Secondary 버튼 레시피, 진행 중 스피너 상태 포함)
- [ ] Step 2: 중복 시작 방지 — 스캔 API가 이미 진행 중 run에 대해 어떤 응답을 주는지 확인하고, 그 응답을 사용자에게 안내 문구로 표시(409 등). API에 방지 로직이 없으면 API에 추가(TDD: 진행 중 run 존재 시 409 테스트 먼저).
- [ ] Step 3: 리포트 헤더 영역에 버튼 배치, 완료된 run 화면에서만 노출
- [ ] Step 4: 검증(npm test, eslint, tsc) 후 커밋 `feat: 리포트 화면에서 재스캔 트리거 (#75)`

### Task 2: 자산 목록 상태·위험도 컬럼 + 집계 헬퍼 추출 (#69)

**Files:**
- Create: `src/lib/pipeline/assetStatus.ts` + `assetStatus.test.ts`
- Modify: `src/app/page.tsx`, `src/app/projects/page.tsx` (기존 중복 집계를 헬퍼로 교체), `src/app/assets/page.tsx` (컬럼 추가)

**Interfaces:**
- Produces: `getAssetStatusMap(): Map<string, AssetStatus>` — 자산별 최신 run 기준 `{ kind: "pass" | "fail" | "review" | "error" | "running" | "none", runId?: string }`. 대시보드(`src/app/page.tsx`)의 기존 집계 로직을 그대로 이관(동작 변경 금지). `error`=파이프라인 실패("실패"), `none`=점검 이력 없음("미점검").

- [ ] Step 1 (TDD): assetStatus.test.ts 작성 — succeeded+취약→fail, succeeded+양호→pass, failed→error, running→running, run 없음→none 케이스. 실패 확인.
- [ ] Step 2: 대시보드의 집계 로직을 이관해 구현, 테스트 통과
- [ ] Step 3: page.tsx·projects/page.tsx를 헬퍼 사용으로 리팩터링(렌더 결과 불변 — 라벨·배지 동일)
- [ ] Step 4: /assets 테이블에 상태 컬럼 추가 — 배지 매핑: pass→"양호", fail→"취약", review→"검토", error→"실패"(fail 배지), running→"진행 중"(progress 배지), none→"미점검"(neutral)
- [ ] Step 5: 검증 후 커밋 `feat: 자산 목록에 상태·위험도 컬럼 추가, 집계 헬퍼 공용화 (#69)`

### Task 3: 자산·프로젝트 목록 검색 (#77)

**Files:**
- Modify: `src/app/assets/page.tsx`, `src/app/assets/AssetFilters.tsx`, `src/app/projects/page.tsx` (+ 필요시 검색 입력용 소형 client 컴포넌트 신설)
- 검색 필터링이 서버 컴포넌트에서 일어나면 필터 함수를 `src/lib`에 두고 유닛 테스트

**Interfaces:**
- 쿼리 파라미터 `?q=` — 자산: 이름/레포 URL/호스트 IP 부분 일치(대소문자 무시), 프로젝트: 이름. 기존 AssetFilters의 파라미터 패턴과 조합.

- [ ] Step 1 (TDD): 검색 매칭 함수 테스트 → 구현
- [ ] Step 2: AssetFilters에 검색 입력(입력 필드 레시피, 라벨 상단) 추가, 프로젝트 목록에도 동일 패턴
- [ ] Step 3: 결과 0건 빈 상태 문구, 쿼리 파라미터 유지 확인
- [ ] Step 4: 검증 후 커밋 `feat: 자산·프로젝트 목록 검색 (#77)`

### Task 4: 카탈로그 필터·검색 (#70)

**Files:**
- Modify: `src/app/catalog/page.tsx` (+ 필터 함수는 `src/lib/catalog/`에, 테스트 동반)

**Interfaces:**
- 쿼리 파라미터: `?framework=`(다중 가능), `?mode=`(자동/수동), `?q=`(코드·제목). 필터 상태는 URL로만 관리(서버 컴포넌트 유지).

- [ ] Step 1 (TDD): 카탈로그 필터 함수 테스트 → 구현 (기존 `src/lib/catalog/` 타입 사용)
- [ ] Step 2: 사이드 필터 패널 UI (목업 catalog.html 참고, Kinetic 레시피 — 체크박스/링크 기반, 클라이언트 상태 없이 링크로 쿼리 갱신 가능하면 그 방식 우선)
- [ ] Step 3: 결과 건수 표시, 필터+검색 조합 동작
- [ ] Step 4: 검증 후 커밋 `feat: 카탈로그 필터·검색 (#70)`

### Task 5: 점검 보고서 CSV 내보내기 (#74)

**Files:**
- Create: `src/lib/report/exportCsv.ts` + `exportCsv.test.ts`, `src/app/api/runs/[id]/export/route.ts`
- Modify: `src/app/runs/[id]/report/ReportView.tsx` 또는 report/page.tsx (다운로드 버튼)

**Interfaces:**
- `buildReportCsv(run, checks, analyses): string` — 요약 행(전체/양호/취약/검토) + 항목별(항목 ID·제목·상태·심각도·사유·조치). UTF-8 BOM(`﻿`) 선행. API는 `Content-Disposition: attachment; filename*=UTF-8''...` (자산명·일시 포함).

- [ ] Step 1 (TDD): buildReportCsv 테스트(쉼표/따옴표/개행 이스케이프, BOM, 요약 수치) → 구현
- [ ] Step 2: export route — 완료된 run만 허용(진행 중/실패 400), 기존 run 조회 함수 재사용
- [ ] Step 3: 리포트 화면에 "보고서 내보내기" Secondary 버튼(`<a href>` 다운로드), 완료 run에서만 노출
- [ ] Step 4: 검증 후 커밋 `feat: 점검 보고서 CSV 내보내기 (#74)`

### Task 6: 자산 모델 확장 — OS·담당자 (#76)

**Files:**
- Modify: DB 스키마 초기화/마이그레이션 위치(`src/lib/db.ts` 등 — 실제 위치 확인), `src/lib/assets/` 스토어·타입, `src/lib/assets/excelImport.ts`(+테스트), `src/app/assets/new/AssetForm.tsx`, `src/app/api/assets/upload/template/route.ts`(엑셀 템플릿), `src/app/assets/[id]/page.tsx`(자산 정보 표시), 관련 API 라우트

**Interfaces:**
- `Asset`에 `os?: string`, `owner?: string` (선택). 기존 행은 NULL 허용 — `ALTER TABLE assets ADD COLUMN os TEXT` / `ADD COLUMN owner TEXT`를 기존 마이그레이션 패턴에 맞춰 추가(이미 컬럼 존재 시 무시되는 방어 포함).

- [ ] Step 1 (TDD): excelImport 테스트에 신규 컬럼 유/무 케이스 추가 → 실패 확인
- [ ] Step 2: 스키마 마이그레이션 + 타입/스토어/파서 반영 → 테스트 통과
- [ ] Step 3: 등록 폼 필드 2개(선택 입력, 레시피 준수), 엑셀 템플릿 컬럼, 상세 "자산 정보" dl에 표시(값 없으면 "—")
- [ ] Step 4: 기존 DB 파일로 dev 서버가 정상 기동하는지 확인(마이그레이션 호환), 검증 후 커밋 `feat: 자산 모델에 OS·담당자 필드 추가 (#76)`

### Task 7: 공유 링크 활성/비활성 토글 및 폐기 (#71)

**Files:**
- Modify: 공유 링크 스키마·스토어(`projects` 테이블의 share 관련 컬럼 — 실제 구조 확인), `src/app/api/projects/[id]/share/route.ts`, `src/app/api/share/[token]/route.ts`(비활성/폐기 거부), `src/app/projects/[id]/ShareLinkPanel.tsx`, `src/app/share/[token]/ShareGate.tsx`(거부 화면)
- Test: 상태 전이·접근 거부 테스트 (기존 share 테스트 파일 위치 따름)

**Interfaces:**
- 공유 링크 상태: `active | disabled | revoked`. 토글 API(활성↔비활성), 폐기 API(불가역 — 폐기 후 재활성/재발급 정책: 새 토큰 발급은 허용하되 기존 토큰은 영구 무효). 공유 조회는 `active`만 통과.

- [ ] Step 1 (TDD): 상태 전이 + 비활성/폐기 토큰 조회 거부 테스트 → 실패 확인
- [ ] Step 2: 스키마/스토어/API 구현 → 통과
- [ ] Step 3: ShareLinkPanel — 토글(레시피 준수), Revoke는 Danger 버튼 + confirm 단계. 폐기 상태 표기.
- [ ] Step 4: ShareGate/공유 페이지 — 무효 토큰 접근 시 명확한 거부 화면(비밀번호 폼 미노출)
- [ ] Step 5: 검증 후 커밋 `feat: 공유 링크 활성/비활성 토글·폐기 (#71)`

### Task 8: 진행 중 점검 취소 (#73)

**Files:**
- Create: `src/app/api/runs/[id]/cancel/route.ts`, 취소 버튼(client) — `src/app/runs/[id]/RunStatus.tsx` 또는 별도 컴포넌트
- Modify: `src/lib/pipeline/runs.ts`(상태 `cancelled` 추가), `src/lib/pipeline/orchestrator.ts`·`sandboxTimeout.ts` 등 실행 중단 지점(실제 실행 구조 확인 필수 — 프로세스/컨테이너 정리), 상태 표시 매핑들(runs 목록·batch·대시보드·자산상세·프로젝트·공유뷰의 상태 매핑에 cancelled 추가 — Task 2의 `assetStatus.ts` 포함)

**Interfaces:**
- `RunStatus`에 `"cancelled"` 추가. 취소 API: running run만 허용(그 외 409), 파이프라인 중단 + `cancelled` 저장. 표시: neutral 배지 + "취소됨" 라벨 (실패·양호·취약과 구분).

- [ ] Step 1: orchestrator의 실행 모델(동기/비동기, 프로세스 추적 방식)을 먼저 읽고 중단 전략 결정 — 강제 종료가 불가능한 구조면 "취소 요청 플래그 + 단계 경계에서 중단" 방식으로 구현하고 그 한계를 이슈에 코멘트
- [ ] Step 2 (TDD): 취소 상태 전이·거부 케이스 테스트 → 구현
- [ ] Step 3: RunStatus 화면에 취소 버튼(Danger, confirm 단계, running일 때만) + 폴링이 cancelled 반영
- [ ] Step 4: 전 화면 상태 매핑에 cancelled 추가(빠짐 없이 — grep으로 status 매핑 지점 전수 확인)
- [ ] Step 5: 검증 후 커밋 `feat: 진행 중 점검 취소 (#73)`

### Task 9: 공유 뷰에 판정 배지 노출 (#72)

**Files:**
- Modify: `src/app/api/share/[token]/route.ts` (자산별 최신 outcome 추가 — Task 2의 `getAssetStatusMap` 재사용), `src/app/share/[token]/ShareGate.tsx` (자산 테이블·이력에 판정 배지)
- Test: 공유 API 응답 필드 테스트 (세부 내역 미노출 확인 포함)

**Interfaces:**
- 공유 API 응답의 자산 항목에 `verdict: "pass" | "fail" | "review" | "error" | "running" | "none"` 추가. **건수·항목 상세는 추가하지 않는다** (사용자 결정: 판정 배지까지만).

- [ ] Step 1 (TDD): 공유 API 응답에 verdict 포함 + 상세 필드 부재 테스트 → 구현 (Task 2 헬퍼 재사용)
- [ ] Step 2: ShareGate 자산 테이블에 판정 배지(내부와 동일 매핑: 실패≠취약), 기존 파이프라인 상태 표시는 이력 쪽에 유지
- [ ] Step 3: 검증 후 커밋 `feat: 공유 뷰에 자산별 판정 배지 노출 (#72)`

### Task 10: 인증 최소판 — 자체 계정·세션·프로필 (#78)

**Files:**
- Create: `docs/adr/NNNN-authentication.md` (기존 docs/adr 번호 규칙 확인), `src/lib/auth/` (계정 스토어·비밀번호 해시·세션), `src/app/login/page.tsx` + 로그인 폼, `src/app/api/auth/login/route.ts`·`logout/route.ts`, `middleware.ts`(또는 Next 16의 권장 위치 — proxy/middleware 컨벤션 확인)
- Modify: `src/app/_components/AppHeader.tsx` (프로필 블록 + 로그아웃), 스키마(users·sessions 테이블)

**Interfaces:**
- ADR 결정 사항(문서에 기록): 자체 계정, scrypt/bcrypt 해시(Node 내장 `crypto.scrypt` 우선 — 신규 의존성 최소화), httpOnly 세션 쿠키, 세션 만료 7일, 초기 계정은 env 또는 시드 스크립트로 생성.
- **비인증 접근 경계(명시적)**: `/share/[token]`과 `/api/share/[token]`은 인증 없이 접근 가능(공유 링크의 존재 이유). `/login`·정적 자산 제외 나머지는 로그인 필요.
- 헤더 프로필 블록: 사용자명 + 로그아웃 버튼 (목업의 아바타는 이니셜 원형으로 대체).

- [ ] Step 1: ADR 작성·커밋 (구현 전)
- [ ] Step 2 (TDD): 비밀번호 해시/검증·세션 생성/만료/무효화 테스트 → 구현
- [ ] Step 3: 로그인 페이지(중앙 Card, 입력 레시피, Primary 버튼) + login/logout API
- [ ] Step 4: 미들웨어 가드 — 공유 라우트 예외 포함. 미인증 시 /login 리다이렉트.
- [ ] Step 5: AppHeader 프로필 블록 + 로그아웃. 초기 관리자 계정 생성 경로(시드) 문서화(README 또는 ADR).
- [ ] Step 6: 전 라우트 스모크(로그인 전 리다이렉트, 로그인 후 접근, 공유 링크 비인증 접근) 확인, 검증 후 커밋 `feat: 자체 계정 인증 최소판 — 로그인·세션·프로필 (#78)`

---

## 최종 태스크: 전수 검증 + 이슈 정리

- [ ] `npm test`/`npm run lint`/`npm run build` 전수 통과
- [ ] dev 서버에서 주요 플로우 스모크 (로그인 → 자산 → 스캔 → 리포트 → export → 공유 링크)
- [ ] 백로그 문서에 완료 표시 갱신, 최종 whole-branch 리뷰 후 머지·푸시(사용자 확인) 및 이슈 클로즈
