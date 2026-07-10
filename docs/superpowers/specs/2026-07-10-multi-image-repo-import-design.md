# 레포 가져오기 → 이미지별 자산 → 일괄 점검 설계

날짜: 2026-07-10
상태: 사용자 검토 대기

## 배경 / 문제

하나의 레포에 여러 Dockerfile이 있는 경우가 많다. 실제 사례 `github.com/blueskytto/ocpm`는
하드닝된 base 이미지 모음 레포로, `nhit-image/*/Dockerfile` 약 26개(eclipse-temurin jdk/jre 여러
버전, python 3.12~3.14, node 20/22/24, nginx 여러 버전, tomcat 9/10/11, redis·valkey·rabbitmq·
httpd·debian 등) + `frontend/Dockerfile` + `backend/Dockerfile`로 총 ~28개의 이미지를 담고 있다.

현재 파이프라인은 repo 자산 하나당 **Dockerfile 하나만** 자동 선택해 점검한다. 그래서 이런
레포는 이미지 하나만 점검되고 나머지는 방치된다. 각 이미지를 **개별 자산**으로 보고 한 번에
일괄 점검하고 싶다.

## 목표

레포 URL 하나를 "가져오기"하면 레포 내 모든 Dockerfile을 발견해 선택하게 하고, 선택된 이미지마다
개별 repo 자산을 만들어 하나의 프로젝트로 묶은 뒤, 기존 fleet(batch) 점검으로 일괄 점검한다.

## 사용자 확정 결정

- **자산 모델**: Dockerfile마다 개별 자산 (repo 자산에 `dockerfilePath` 필드 추가).
- **가져오기/배치**: 레포 가져오기 → 프로젝트 1개 + 이미지당 자산 생성 → 기존 프로젝트 fleet 점검 재사용.

## 범위

**포함**: 레포 내 Dockerfile 전체 발견, 선택적 자산 생성(이미지당), 프로젝트로 그룹핑, 지정된
Dockerfile로 빌드/점검, 기존 fleet 점검으로 일괄 실행.

**제외(이번 범위 아님)**:
- docker-compose.yml 파싱, 이미지 간 빌드 의존성/순서.
- 자산 등록 후 레포에 Dockerfile이 추가/삭제됐을 때 자동 동기화(수동 재-import로 대응).
- Dockerfile이 아예 없는 레포의 pre-built 이미지 참조 탐색.

## 설계

### 1. 데이터 모델 — `src/lib/assets/types.ts`, `src/lib/db/index.ts`, `src/lib/assets/store.ts`

- `Asset`에 `dockerfilePath: string | null` 추가. `null`이면 스캔 시 자동 탐색(기존 동작), 값이 있으면
  레포 루트 기준 상대경로의 그 Dockerfile을 사용.
- 마이그레이션: `ALTER TABLE assets ADD COLUMN dockerfile_path TEXT`(멱등, os/owner 패턴 준수).
- 중복 검사 변경(`createRepoAsset`): 현재 `WHERE type='repo' AND repo_url=?` →
  `WHERE type='repo' AND repo_url=? AND (dockerfile_path IS ? )`(즉 `(repo_url, dockerfile_path)`
  조합이 같을 때만 `DuplicateAssetError`). `NULL` 경로끼리도 중복으로 취급(기존 단일-자동탐색 자산의
  중복 방지 유지). 구현 시 `dockerfile_path` NULL 비교는 `IS` 의미로 처리.

### 2. Dockerfile 발견 — `src/lib/pipeline/dockerfile.ts`

- `listDockerfiles(repoDir: string): string[]` 추가: 기존 `detectDockerfile`의 트리 탐색·제외
  디렉터리·확장자 데니리스트·정렬 로직을 재사용해 **모든** 후보의 절대경로를 정렬된 배열로 반환.
- `detectDockerfile`은 `listDockerfiles(repoDir)[0]`을 반환하도록 리팩터(동작·선택순위 불변).
  기존 `detectDockerfile` 테스트는 그대로 통과해야 한다.

### 3. 가져오기 플로우 (신규)

**발견 API** — `POST /api/assets/import/discover`
- body: `{ repoUrl: string }`.
- shallow clone(기존 `cloneRepo` 재사용, 임시 runId로) → `listDockerfiles` → 레포 루트 기준
  상대경로 목록 반환 → **임시 클론 삭제(finally)**.
- 반환: `{ dockerfiles: string[] }`. clone 실패 시 명확한 에러 메시지, 0개면 빈 배열.

**생성 API** — `POST /api/assets/import/create`
- body: `{ repoUrl: string, projectName: string, dockerfilePaths: string[] }`.
- 프로젝트 1개 생성(기존 프로젝트 스토어) + `dockerfilePaths`마다 repo 자산 생성:
  - `repoUrl` 공통, `dockerfilePath` = 각 경로, `projectId` = 새 프로젝트,
    `displayName` = `<repo 이름> / <dockerfilePath>` 형태(예: `ocpm / nhit-image/redis-8.2.6`).
  - 이미 존재하는 `(repoUrl, dockerfilePath)`는 건너뛰고 결과에 `skipped`로 보고.
- 반환: `{ projectId: string, created: number, skipped: string[] }`.

**UI** — `/assets/import` 페이지 (Kinetic 레시피 준수)
- 1단계: 레포 URL 입력 + "발견" 버튼 → discover 호출 → 발견된 Dockerfile 목록.
- 2단계: 체크박스 목록(전체선택 토글, 경로 표시), 프로젝트명 입력 → "가져오기" → create 호출 →
  생성된 프로젝트로 이동(`/projects/[id]`).
- 로딩/에러 상태 표시. discover는 clone을 수반하므로 진행 표시.

### 4. 일괄 점검 (기존 재사용)

- 생성된 프로젝트를 기존 **fleet scan**으로 점검: `scanProjectFleet` + `runWithConcurrency` +
  `createScanBatch`가 프로젝트의 모든 자산(=선택된 이미지들)에 대해 run을 만들고 동시성 제한 하에
  실행. **새 batch 오케스트레이션을 만들지 않는다.**
- 프로젝트 상세(`/projects/[id]`)의 기존 `FleetScanButton`이 그대로 트리거.

### 5. 파이프라인 변경 (최소) — `src/lib/pipeline/orchestrator.ts` (+ serverScan의 repo 경로가 있으면 동일)

- git(repo) 소스 실행 시, 스캔 대상 asset의 `dockerfilePath`가 있으면:
  - clone 후 `path.join(repoDir, asset.dockerfilePath)` 존재 확인 → 없으면 build 단계 실패
    (`"지정된 Dockerfile을 찾을 수 없습니다: <경로>"`).
  - 있으면 그 경로를 `dockerfilePath`로 사용(자동 탐색 건너뜀).
- `dockerfilePath`가 없으면 기존 `detectDockerfile` 자동 탐색(현행 유지).
- 빌드 컨텍스트는 이미 "Dockerfile이 있는 디렉터리"라 서브경로 이미지에 그대로 맞다(직전 수정).
- **전달 방식(확정)**: `RunSource`의 git 변형(`{ type: "git", repoUrl }`)에 선택적 `dockerfilePath?: string`
  추가. run을 만드는 호출부(fleet scan / repo 스캔 시작 경로)가 asset의 `dockerfilePath`를 읽어
  `runPipeline`에 넘기는 source에 실어 보낸다. orchestrator는 DB에서 asset을 다시 조회하지 않고
  `source.dockerfilePath`만 참조 → dep 주입 테스트 유지. `source.dockerfilePath`가 없으면 자동 탐색.

### 6. 에러 / 엣지

- discover: clone 실패 → 메시지 반환, 임시 클론 항상 삭제. Dockerfile 0개 → UI에 "발견된 Dockerfile
  없음".
- create: 빈 선택 → 400. 중복 `(repoUrl, path)` → skip 후 보고. 프로젝트명 누락 → 400.
- 대량(수십 개) 동시 빌드 부하 → 기존 `runWithConcurrency`의 동시성 제한으로 방어(새 제한 도입 안 함).
- 지정 Dockerfile이 clone 후 사라진 경우(레포 변경) → 해당 run만 build 실패, 나머지 진행.

### 7. 테스트

- `listDockerfiles`: 다중 발견 정렬·제외 디렉터리·데니리스트, `detectDockerfile`가 첫 요소와 일치.
- 중복 검사: 같은 repoUrl + 다른 path는 생성 가능, 같은 (repoUrl, path)는 `DuplicateAssetError`,
  NULL path끼리 중복.
- discover/create API: 발견 목록 반환·임시 클론 정리, 프로젝트+자산 생성·skip 보고, 검증 오류.
- orchestrator: `dockerfilePath` 지정 시 그 경로로 build 호출·자동탐색 미호출, 지정 경로 부재 시 실패.
- 인증 경계: 새 import API 2개는 보호 API이므로 `requireApiSession` 적용(#78 패턴).

## 검증

- `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 통과(현재 689 + 신규).
- `npm run lint` / `npx tsc --noEmit` / `npm run build` 통과.
- dev 서버에서 ocpm URL로 import → 발견 목록 확인 → 일부 선택 → 프로젝트 생성 → fleet 점검이
  이미지별 run으로 진행되는지 확인.

## 회귀 방지

- `dockerfilePath`가 null인 기존 repo 자산: 자동 탐색 유지 → 기존 동작 그대로.
- `detectDockerfile` 시그니처·선택순위 불변(내부적으로 listDockerfiles 사용).
- 기존 프로젝트 fleet/batch 점검·서버 자산 경로 무변경.
