# 컨테이너 이미지 전면 점검(OS+서비스 자동 탐지) 설계

> 작성일: 2026-07-14
> 상태: 승인됨(사용자 결정 확정) → 구현 계획 대기

## 문제
도커 이미지(repo·local_image 자산)를 점검하면 지금은 **컨테이너 하드닝(C-*)만** 적용된다. 그러나 이미지는
사실상 **OS(리눅스 userland) + 서비스(nginx·postgres·tomcat 등)**의 결합이라, 그 안의 OS·서비스에
해당하는 점검 항목이 함께 적용되어야 한다.

## 원인
`resolveCheckPlan`은 비-server 자산에 baseline으로 `containerPack`만 넣고, 벤더 팩은 `asset.category+vendor`가
선언됐을 때만 추가한다. 이미지는 보통 category/vendor가 없어 컨테이너 팩만 돈다.

한편 **배관은 이미 충분하다**: 컨테이너 점검 경로(`runAllChecks`)도 `resolveCheckPlan`/`evaluatePlan`을 쓰고
`plan.evidenceTasks`(+ 베이스 security-checks.yml)를 컨테이너 안에서 실행한다. 즉 U-*/C-* 증거는 컨테이너
안에서 이미 수집되고, 벤더 팩 증거도 plan에 넣으면 함께 수집된다. **plan에 팩을 안 넣어 "평가"만 안 했던 것.**

## 확정 결정
- 이미지에서 **미탐지 벤더 팩 → SKIP**(표시 안 함). (서버의 "선언 벤더 미확인 → review"와 다른 정책.)
- **U-*(OS)는 OS 감지 시에만** 적용(distroless/scratch 이미지 배려).
- 자동 탐지 벤더 범위(이번): **nginx·apache·tomcat·mysql/mariadb·postgres**(테스트 가능한 리눅스 벤더).
  oracle/windows/redis 등은 제외(redis는 팩 자체 없음 — 백로그).

## 아키텍처 — "declared" vs "autodetect" 두 모드
`CheckPlan`에 `mode?: "declared" | "autodetect"`(기본 declared) 추가.

### resolveCheckPlan
- **server 자산 → 기존 로직 그대로(mode: "declared")**: 선언 category/vendor로 벤더 팩 선택, 미확인은 review.
- **비-server(repo·local_image) → mode: "autodetect"**:
  `packs = [containerPack, osUnixPack, webNginxPack, webApachePack, wasTomcatPack, dbMysqlPack, dbPostgresPack]`.
  이들의 evidenceTasks + 베이스 플레이북이 컨테이너 안에서 수집된다.
  (선언 벤더가 있어도 이미지는 자동 탐지 우선 — 고정 오토셋 사용.)

### evaluate (mode 인지)
- `evaluatePack(pack, ctx, mode)`:
  - `executionPath === "windows"` → reviewAll(현행). (컨테이너 오토셋엔 windows 팩 없음.)
  - **mode "autodetect"**: `pack.detect(ctx.tasks) ? pack.evaluate(ctx) : skipAll(pack, 사유)`.
    - `containerPack.detect = () => true` → C-* 항상 평가.
    - `osUnixPack.detect` → **OS 감지(아래)** 시에만 U-* 평가, 아니면 skip.
    - 벤더 팩 detect(nginx/postgres/…) → 설치됐으면 평가, 아니면 **skip**.
  - **mode "declared"**(현행): vendors 있고 미탐지 → reviewAll; 그 외 평가. (서버 회귀 없음.)
- `skipAll(pack, message)`: `pack.itemIds`를 `status:"skip"`로. 사유: 벤더 팩이면 "이미지에 {vendor} 미설치 —
  해당 없음", OS면 "OS(리눅스 userland) 미탐지 — 해당 없음".
- `evaluatePlan(plan, ctx, asset)`: `mode = plan.mode ?? "declared"`로 evaluatePack 호출. `VENDOR-NA`(미지원
  벤더) 합성 항목은 **declared 모드에서만**(현행 유지). autodetect는 skip 정책이라 불필요.

### OS 감지 (osUnixPack)
- osUnixPack.evidenceTasks에 `os detection (internal)` 추가: `cat /etc/os-release 2>/dev/null || uname -s`.
- osUnixPack.detect(tasks): 해당 태스크 stdout이 비어있지 않으면 true. (declared 모드에선 detect가 평가에
  쓰이지 않으므로 서버 U-* 항상 평가는 불변.)

## 데이터 흐름 (컨테이너)
```
build 이미지 → sandbox → runAllChecks: resolveCheckPlan(autodetect)
  → runAnsibleChecks(container, plan.evidenceTasks + 베이스)  // C-*/U-*/벤더 증거 컨테이너 안에서 수집
  → evaluatePlan(autodetect): container(C-*) 항상, osUnix(U-*) OS감지시, 벤더팩 detect시 평가·아니면 skip
```

## 에러/경계
- distroless/스크래치(셸·os-release 없음): osUnix detect=false → U-* skip, 벤더 미탐지 → skip, 컨테이너 C-*만.
- 벤더 팩 evidence 태스크는 read-only 쉘 프로브 — 컨테이너에서 안전.
- 서버 경로·windowsOnly(serverScan) 로직 불변(declared 모드, 컨테이너 팩은 전부 linux).
- itemIds 프리픽스 분리(각 벤더 팩 자기 항목만)는 기존대로 — 카테고리 공유 팩 중복 평가 없음.

## 테스트 전략
- 단위(resolve): 비-server → mode autodetect + packs=[container,osUnix,nginx,apache,tomcat,mysql,postgres],
  server → mode declared + 기존 팩(회귀).
- 단위(evaluate): autodetect에서 (a) 탐지된 벤더 evaluate, (b) 미탐지 벤더 skip(review 아님), (c) OS 감지
  없으면 U-* skip·있으면 평가, (d) container C-* 항상. declared 회귀(미탐지→review, VENDOR-NA).
- 단위(osUnix): os detection 태스크 유무로 detect true/false.
- 실제 흐름 verify(컨테이너): nginx·postgres 등 실제 도커 이미지를 repo 자산으로 점검 → C-*+U-*+해당 벤더
  항목이 나오고, 없는 벤더는 결과에 없음(skip). (컨트롤러 E2E.)

## 다루지 않는 것
- redis/oracle/windows 자동 탐지(팩 없음/테스트 난이도), 이미지 내 다중 서비스 동시(대부분 단일 서비스),
  선언 벤더가 있는 repo의 특수 처리(오토셋으로 충분), CVE·미티게이션 연동(별개).
