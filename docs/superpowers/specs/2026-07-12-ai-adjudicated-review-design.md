# AI 판정(review 흡수) — #2a 설계

> 작성일: 2026-07-12
> 상태: 승인됨(브레인스토밍) → 구현 계획 대기
> 로드맵 위치: #0 엔진 ✅ · #1 Apache ✅ · **#2a AI 판정(이 문서)** · #2 WAS/Tomcat · #3 DB · #4 Windows

## 목표

점검 시 수집한 증거를 근거로, **룰이 판정을 보류한(`review`) 항목만** Claude 분석 단계가
실제 pass/fail로 판정하게 하여 수동 검토 항목을 줄인다. 룰이 내린 pass/fail/skip은 절대
바꾸지 않는다. Claude 분석이 꺼져 있으면 review는 그대로 유지된다(정직한 기본값). 이 메커니즘은
특정 벤더에 종속되지 않으며 기존 모든 팩(nginx/apache/unix/container)의 review 항목에 적용된다.

## 배경 (현재 동작)

- `analyzeAndSaveChecks`(`src/lib/claude/index.ts`)는 `CLAUDE_ANALYSIS_ENABLED==="true"`일 때만
  동작하며(기본 off, 토큰 비용), 모든 체크에 대해 `analyzeCheck`를 호출한다.
- `analyzeCheck`(`src/lib/claude/analyze.ts`)의 프롬프트는 **"status를 절대 바꾸지 말 것 / 입력 status를
  그대로 반환"** 으로 잠겨 있다. 즉 현재 Claude는 설명(reason/remediation/example)만 붙이고 판정은
  룰 그대로다 — review를 줄여주지 못한다.
- `check_results` 테이블은 룰 status만 저장한다. `DecoratedCheckResult.source: "rule"|"ai"`가 이미
  존재하나, 지금은 "분석 리포트가 있는지" 수준으로만 쓰인다.

## 아키텍처

### 판정 주체(`source`)의 의미 재정의

`source`는 **verdict(판정)의 주체**를 뜻한다:
- `rule`: 룰이 status(pass/fail/skip/review)를 결정. AI가 설명을 붙였더라도 판정 주체는 룰.
- `ai`: 룰이 `review`였던 항목을 **AI가 증거로 pass/fail로 판정**함. AI 판정 항목에만 부여.

### 분석 단계 변경 (`analyze.ts` / `schema.ts`)

- 스키마에 AI 응답 필드 `verdict: "pass" | "fail" | "review"` 추가.
- 프롬프트를 입력 status로 분기:
  - `result.status === "review"`: "수집된 증거에 근거해 pass 또는 fail로 판정하라. 증거가 불충분하면
    `review`를 유지하라." → `verdict`로 실제 판정을 받는다.
  - 그 외(pass/fail/skip): 기존 잠금 유지 — `verdict`는 입력 status와 동일해야 하며 판정을 바꾸지 않는다.
- `analyzeCheck` 반환에 `verdict`를 포함(review 입력이 아니면 입력 status와 동일).

### 결과 반영 (행 갱신 방식)

- `check_results`에 **`source TEXT` 컬럼 추가**(ADD COLUMN 마이그레이션, 기본 `'rule'`).
- `analyzeAndSaveChecks`가 review 항목에 대해 AI `verdict`를 받으면:
  - `verdict`가 `pass`/`fail`이면 해당 run·item의 `check_results.status`를 `verdict`로 UPDATE하고
    `source='ai'`로 기록.
  - `verdict`가 여전히 `review`면 status·source 변경 없음(`source='rule'` 유지).
  - 분석 리포트(reason/remediation/example)는 기존대로 저장 — "룰은 review였고 AI가 이렇게 판정했다"는
    맥락은 reason에 담긴다.
- 이렇게 하면 riskSummary/대시보드/리포트/배치 컬럼이 **모두 조정된 status를 자동으로** 집계한다(별도
  레이어링 불필요). 파이프라인 순서상 rule_eval(저장) → claude(갱신)이므로 run 완료 전에 확정된다.
- 조회(`listCheckResults`)·decorate가 `source`를 함께 반환(레거시 행은 `source` null → `'rule'`로 표시).

### 안전장치

- AI는 **`review` → {`pass`,`fail`,`review`}** 만 가능. 룰이 낸 pass/fail/skip 행은 UPDATE 대상에서 제외.
- Claude off(기본): review 그대로, `source='rule'`.
- AI가 거부(refusal)하거나 오류면 해당 항목은 review 유지(기존 "AI 실패는 체크 실패와 독립" 원칙 준수).

## UI 변경점

1. **리포트 항목 리스트 행**(`src/app/runs/[id]/report/ReportView.tsx`): AI 판정(`source==="ai"`) 행에
   **스파클 배지(ClaudeSparkleIcon)** 를 상태 배지 옆에 표시 — 목록만 훑어도 AI가 판정한 항목이 보인다.
2. **리포트 상세 패널**: 기존 SOURCE 배지 문구 `ai: "AI 분석"` → **`"AI 판정"`**. reason 헤딩("AI 분석 근거")은 유지.
3. **배지 툴팁**: "룰이 판정을 보류(검토)한 항목을 AI가 점검 증거로 판정함" 짧은 안내(`title` 속성).
4. **"AI 판정" 필터 facet**(경량 토글): 리포트 항목 필터에 AI 판정 항목만 보기 토글 추가. 기존 category/
   status/compliance 필터와 AND 결합. 해당 항목이 없으면 토글 숨김.
5. **RunStatus 요약**(`src/app/runs/[id]/RunStatus.tsx`): 기존 `aiCount` 기반 문구를 **"AI 판정 N건"** 으로
   정합화(source가 판정 주체가 되었으므로 aiCount=AI 판정 건수).
6. **대시보드·위험요약·배치 컬럼**: 구조 변경 없음. 행 갱신으로 조정된 status를 그대로 집계(점수/도넛/
   취약 건수에 자동 반영). review 떠넘김이 줄어 신뢰도가 오른다.

## 데이터 흐름

```
rule_eval: 룰 판정 → check_results 저장(status, source='rule')
claude(enabled): 각 review 항목 → analyzeCheck(evidence) → verdict
        verdict∈{pass,fail} → UPDATE check_results.status=verdict, source='ai'
        verdict=review        → 변경 없음
표시: decorate가 status+source 반환 → 리스트/상세 배지, 필터, 요약, 대시보드 집계
```

## 에러 / 경계 처리

- Claude 미활성: 전 항목 룰 status·`source='rule'`.
- AI refusal/스키마 위반/오류: 해당 항목 review 유지, 다른 항목 계속(부분 실패 허용).
- 비-review 항목에 AI가 다른 verdict를 반환하면 **무시**하고 룰 status 유지(코드 레벨 방어, 프롬프트만
  믿지 않음).
- 마이그레이션: `check_results.source` 없으면 ADD COLUMN(기본 `'rule'`), 기존 행은 조회 시 `'rule'`로 표시.

## 테스트 전략

- **단위:**
  - `analyzeCheck`: review 입력 → verdict(pass/fail/review) 허용; 비-review 입력 → verdict가 입력 status로 고정.
  - `analyzeAndSaveChecks`: review→pass/fail이면 status UPDATE + source='ai'; review 유지면 무변경;
    비-review는 AI가 뭘 반환하든 status 불변(코드 방어).
  - store: `source` 저장/조회, 레거시 null→'rule'.
  - riskSummary: 조정된 status로 집계(review 감소, fail/pass 증가) 확인.
- **통합:** decorate가 source 반환, ReportView 필터/배지가 source로 동작.
- **실제 흐름 verify:** `CLAUDE_ANALYSIS_ENABLED=true`로 실제 Claude 호출 — review 항목(예: nginx WEB-01/02,
  apache WEB-25, unix 일부)이 AI 판정으로 흡수되는지, 배지·필터·요약·대시보드 집계가 반영되는지 확인.
  Claude off로 재실행 시 review로 폴백되는지도 확인.

## 다루지 않는 것

- 룰 판정(pass/fail/skip) 로직 변경.
- 벤더 팩 추가(#2 Tomcat 등은 후속).
- Claude 기본 활성화(비용 정책상 opt-in 유지).
