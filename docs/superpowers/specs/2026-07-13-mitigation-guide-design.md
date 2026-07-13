# 취약 항목 조치 가이드(미티게이션) 설계

> 작성일: 2026-07-13
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 목표
취약(fail)·검토(review)로 나온 각 점검 항목에 대해, 담당자·PM이 바로 조치할 수 있는 **정적(큐레이션)
조치 가이드**를 리포트 상세와 PM 공유뷰에 표시한다. AI 토글·점검 시점과 무관하게 항상 제공.

## 확정 결정
- 출처 = **정적 큐레이션(카탈로그 내장)**. 콘텐츠는 KISA/CIS 기준문 기반으로 Claude 1회 생성→JSON 커밋.
- 범위 = **실제 스캔 벤더 세트**: 접두사 `U-`·`C-`·`WEB-`·`WAS-`·`DB-`·`PG-`. (ORA/MSSQL/WLS/WSP/WIN 보류.)
- 노출 = **리포트 상세(담당자) + PM 공유뷰** 둘 다.

## 데이터 모델
- `Mitigation { risk: string; fix: string; example?: string }`
  - risk: 이 취약점이 왜 위험한가(1~2문장). fix: 조치 방법(설명/단계). example?: 설정·명령 예시(코드블록).
- 저장: `src/lib/catalog/data/mitigations.json` = `{ [itemId]: Mitigation }` 단일 파일(정적 커밋).
- 로더: `src/lib/catalog/mitigations.ts` — `getMitigation(itemId: string): Mitigation | null`.
  카탈로그 index에서 재export(`getMitigation`).

## 콘텐츠 생성/보존
- **초기 시드(수작업, 커밋)**: 대표 항목 소수(예: U-01·U-13·U-16·WEB-01·DB-*·PG-* 몇 개)를 손으로 작성해
  테스트·즉시 데모 보장.
- **스캔 벤더 세트 채우기(1회 생성)**: 컨트롤러가 Claude로 위 접두사 카탈로그 항목의 조치 가이드를 생성해
  `mitigations.json`에 병합·커밋(번역 백필과 동형, 백그라운드 실행). 정적 파일이라 이후 사람이 수정 가능.
- 없는 항목은 `getMitigation`이 `null` → UI가 섹션을 생략(안전 폴백). 보류 벤더는 다음 차수.

## 리포트 API·타입
- `DecoratedCheckResult`에 `mitigation: Mitigation | null` 추가.
- `GET /api/runs/[id]`가 각 체크에 `getMitigation(result.id)`를 붙임(AI 리포트와 독립, 항상).

## 리포트 상세(담당자) 노출 — ReportView
- 선택 항목이 **fail·review**이고 `mitigation`이 있으면 상세 패널에 **"조치 가이드"** 섹션:
  위험(risk)·조치 방법(fix)·설정 예시(example, 코드블록). 기존 SectionLabel·InlineCodeText·코드블록 토큰 사용.
- 기존 AI 분석 섹션(reason/remediation/example)은 그대로 유지 — AI가 있으면 "AI 분석 근거/조치"로,
  정적 가이드는 "표준 조치 가이드"로 **공존**(정적=항상, AI=자산 맞춤 보강).
- pass/skip 항목엔 미표시.

## PM 공유뷰 노출 — 공유 API + ShareGate
- `POST /api/share/[token]` 응답에 **자산별 취약·검토 항목 + 조치 가이드**를 추가한다:
  자산마다 최근 **성공(done/succeeded)** run의 `listCheckResults`에서 status가 fail/review인 항목을 골라
  `{ id, title(카탈로그), severity, status, mitigation }`로. 증거(evidence) 원문·CVE 내역은 계속 비노출
  (PM은 조치 판단 목적).
  - 응답 필드 `findings: { assetId: string; items: ShareFinding[] }[]`.
  - `ShareFinding { id; title; severity; status: "fail"|"review"; mitigation: Mitigation | null }`.
- ShareGate(클라이언트)에 자산별 "조치가 필요한 항목" 섹션 추가: 항목 제목·심각도 배지 + 조치 가이드
  (위험·조치·예시). 기존 카드·배지·SectionLabel 양식 그대로. 항목이 없으면 "조치 필요 항목 없음".

## 에러/경계
- mitigation 없는 항목 → 섹션 생략. 공유뷰는 성공 run 없으면 findings 빈 목록.
- 공유 API는 기존 비밀번호 게이트·판정 규칙 그대로. 증거·건수 등 기존 비노출 정책 유지(조치 가이드·항목
  제목·심각도만 추가).

## 테스트 전략
- `getMitigation` 로더(히트/미스), 카탈로그 index 재export.
- 리포트 API: 체크에 mitigation 부착(있는 항목/없는 항목).
- 공유 API: fail/review 항목만·최근 성공 run 기준·mitigation 포함, evidence 미포함(회귀).
- 데이터 무결성: 시드 항목이 실제 카탈로그 id와 매칭.
- UI(ReportView·ShareGate)는 tsc/eslint/next build + 수동.

## 다루지 않는 것
- 보류 벤더(ORA/MSSQL/WLS/WSP/WIN) 콘텐츠, 조치 이력/완료 체크(트래킹), 자동 조치 실행, 카탈로그 화면 노출.
