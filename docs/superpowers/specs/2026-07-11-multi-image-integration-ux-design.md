# 다중 이미지 통합 UX + 리소스 분산 설계

날짜: 2026-07-11
상태: 사용자 검토 대기

## 배경 / 문제

다중 이미지 레포 가져오기(2026-07-10 기능) 이후 실사용에서 세 가지 통합 문제가 드러났다.
`github.com/blueskytto/ocpm`를 가져오면 한 프로젝트에 29개 이미지별 자산(같은 repoUrl,
서로 다른 `dockerfilePath`)이 생기는데:

- **A. 점검 이력·배치가 자산을 구분 못 함**: `/runs`(runs/page.tsx:107,114)와 배치 뷰
  (batch/[batchId]/page.tsx:74)가 run을 `getRepoDisplayName(run.repoUrl)` + `run.repoUrl`로만
  표시한다. 29개 자산의 repoUrl이 전부 동일해 모든 run이 "ocpm / github.com/blueskytto/ocpm"로
  똑같이 보인다. `?repo=` 필터도 repoUrl로 묶는다. run에는 `asset_id`가 있고 자산엔 구분되는
  `displayName`("ocpm / nhit-image/redis-8.2.6")이 있으나 UI가 안 쓴다.
- **B. 프로젝트 뷰가 정적·상태 없음**: `projects/[id]/page.tsx`는 폴링 없는 서버 컴포넌트이고,
  소속 자산 테이블은 이름·타입 2컬럼뿐이다. 일괄 실행 후 프로젝트 뷰에서 자산별 진행/결과가 안 보인다.
- **C. 리소스 분산 없음**: `FLEET_SCAN_CONCURRENCY = 5`가 서버(SSH) 점검 기준인데, repo 자산은
  로컬 `docker build`(무거움)라 5개 동시 빌드 시 메모리가 고갈된다(실제 발생: docker 강제종료).
  또 orchestrator가 빌드 이미지는 지우지만(`removeImage`) **클론 `data/repos/<runId>`는 안 지워**
  디스크가 누적된다.

## 목표

run을 자산 중심 정체성으로 표시·필터하고, 프로젝트 뷰에 자산별 상태와 배치 진행 중 실시간 갱신을
제공하며, repo 빌드 동시성을 서버와 분리해 낮추고 클론을 정리해 리소스 고갈을 막는다.

## 사용자 확정 결정

- 범위: A + B + C 함께.
- repo(로컬 빌드) 동시 빌드 기본 **2** (env `REPO_SCAN_CONCURRENCY`로 조정), 서버 SSH는 5 유지.

## 범위 밖

- 자산관리 그룹핑(레포/프로젝트별) — 별도.
- 배치 페이지 자체의 실시간(배치 페이지는 이미 별도 존재; 이번엔 프로젝트 뷰 실시간에 집중).
- 빌드 명시적 `--memory` 제한(BuildKit에서 불안정 → 동시성 하향으로 대체).
- 알림.

## 설계

### A. run 자산 중심 식별

**순수 헬퍼** — `src/lib/pipeline/runIdentity.ts`
```ts
export interface RunIdentity { label: string; secondary: string; filterAssetId: string | null; }
export function runDisplayIdentity(
  run: { repoUrl: string; assetId: string | null },
  assetsById: Map<string, { displayName: string }>,
): RunIdentity
```
- `run.assetId`로 자산 조회 성공 → `{ label: asset.displayName, secondary: run.repoUrl, filterAssetId: run.assetId }`.
- 자산 없음(로컬 이미지·삭제된 자산·assetId null) → `{ label: getRepoDisplayName(run.repoUrl), secondary: run.repoUrl, filterAssetId: null }`.

**`/runs`** — `src/app/runs/page.tsx`
- `searchParams`에 `asset?: string` 추가. `asset` 있으면 `runs.filter(r => r.assetId === asset)`,
  아니면 기존 `repo` 필터 유지(로컬 이미지/구 데이터 하위호환).
- `listAssets()`로 `Map<id, asset>` 구성 → 각 run에 `runDisplayIdentity`. "점검 대상" 셀:
  1행 label(자산명), 2행 secondary(repoUrl, muted). 필터 링크는 `filterAssetId`가 있으면
  `?asset=<id>`("이 자산 이력만"), 없으면 기존 `?repo=<url>`.
- 필터 배너 문구도 asset일 때 자산명 기준으로.

**배치 뷰** — `src/app/runs/batch/[batchId]/page.tsx`
- 동일하게 `listAssets()` 맵 + `runDisplayIdentity`로 run 표시(자산명 우선).

### B. 프로젝트 뷰 자산별 상태 + 실시간

**상태 컬럼** — `src/app/projects/[id]/page.tsx`
- `getAssetStatusMap()`(기존, #69) 재사용. 소속 자산 테이블에 "상태" 컬럼 추가 →
  자산별 `StatusBadge`(양호/취약/검토/실패/진행 중/미점검), `/assets`와 동일 매핑
  (kind: pass→양호, fail→취약, review→검토, error→실패, running→진행 중(progress), none→미점검).
- `anyRunning` = 상태맵에 running(진행 중) 자산 존재 여부 계산 → `<AutoRefresh active={anyRunning} />` 렌더.

**실시간 갱신** — `src/app/projects/[id]/AutoRefresh.tsx` (신규, client)
```ts
"use client";
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
```
- 진행 중 자산이 있을 때만 3초마다 `router.refresh()` → 서버 컴포넌트 재렌더로 상태맵 갱신.
  모두 종료되면 `active=false`가 되어 폴링 중단. 새 API 없이 기존 서버 렌더 재사용.

### C. 리소스 분산

**repo/서버 동시성 분리** — `src/lib/pipeline/serverScan.ts`
- `REPO_SCAN_CONCURRENCY`: `parseInt(process.env.REPO_SCAN_CONCURRENCY)` 유효하면 그 값,
  아니면 기본 `2`. 서버는 기존 `FLEET_SCAN_CONCURRENCY = 5` 유지.
- `startProjectFleetScan`·`scanProjectFleet`에서 server/repo 태스크 풀을 **분리 실행**:
  `await Promise.all([ runWithConcurrency(serverTasks, FLEET_SCAN_CONCURRENCY), runWithConcurrency(repoTasks, REPO_SCAN_CONCURRENCY) ])`.
  → repo 빌드는 서버 수와 무관하게 항상 최대 2개. 반환 `{ batchId, runIds }` 형태·runIds 구성 불변.

**클론 정리** — `src/lib/pipeline/orchestrator.ts`
- git 소스 run은 파이프라인 종료 시(성공·실패·취소 공통) 클론 디렉터리(`repoDir`)를 삭제한다.
  단 클론은 정적 Dockerfile 분석(`runChecks` → `analyzeDockerfile`이 파일 읽음) 이후에만 지워야
  하므로, 이미지 정리(`removeImage`)와 같은 최종 시점(파이프라인 끝 finally)에서 `fs.rmSync(repoDir,
  {recursive:true, force:true})`. `local_image` 소스는 클론이 없으므로 대상 아님.
- 주의: 취소 등 조기 return 경로에서도 클론이 남지 않도록, 클론 생성 이후 구간을 try/finally로
  감싸 정리(구현 계획에서 정확한 배치 확정 — 기존 removeImage try/finally 구조 활용).

## 데이터 흐름 정합

- run.assetId(기존 컬럼) ← 자산 스캔 시 이미 세팅됨. A는 이걸 UI에서 resolve만 함(스키마 변경 없음).
- getAssetStatusMap()은 자산별 최신 run 기준 상태 → B의 상태 컬럼·anyRunning 계산에 그대로 사용.
- C는 실행 계층(serverScan)·정리(orchestrator)만 변경, run/asset 데이터 모델 무변경.

## 테스트

- `runDisplayIdentity`(A): 자산 있음→displayName·filterAssetId, 자산 없음/삭제→repoUrl 폴백·filterAssetId null. TDD.
- `/runs` `?asset=` 필터: assetId로 거른다(자산별 이력). (서버 컴포넌트 로직은 헬퍼/필터 단위로 검증)
- 동시성 분리(C): `REPO_SCAN_CONCURRENCY` env 파싱(유효/무효/미설정→2). repo 태스크가 repo 한도로,
  서버 태스크가 서버 한도로 실행되는지(주입된 runPipeline/scan mock 호출 관찰).
- 클론 정리(C): git run 종료 후 repoDir가 삭제되는지(임시 디렉터리로, orchestrator dep 주입 테스트).
- 상태 컬럼(B)은 getAssetStatusMap 기존 테스트 재사용. AutoRefresh는 경량(active=false면 인터벌 미설정).
- 전체 `npm test` 그린 유지.

## 검증

- `npm test`/`npm run lint`/`npx tsc --noEmit`/`npm run build` 통과.
- dev 서버: ocpm 소규모 import(몇 개만) → 프로젝트에서 일괄 실행 → (a) 프로젝트 뷰에 자산별 상태가
  뜨고 진행 중 실시간 갱신, (b) 점검 이력·배치에서 자산명으로 구분, (c) 동시 빌드가 2개 이하로 유지되고
  run 종료 후 `data/repos`에 클론이 남지 않는지 확인.

## 회귀 방지

- 서버 자산 fleet·SSH 점검·기존 단일 repo 자산(자동탐색) 동작 무변경(server 동시성 5 유지).
- `?repo=` 필터·로컬 이미지 run 표시 하위호환 유지(자산 없는 run은 repoUrl 폴백).
- run/asset 스키마 변경 없음.

## 운영 참고 (코드 외)

docker prune·클론 삭제 후에도 Mac 호스트 디스크가 99%면 이는 docker/앱 밖 요인(APFS 로컬 스냅샷,
Docker.raw 과거 크기, 휴지통 등)이다. 호스트 여유 확보(휴지통 비우기, `tmutil deletelocalsnapshots /`,
Docker Desktop 디스크 이미지 축소)가 별도로 필요할 수 있다.
