# Dockerfile 트리 탐색 + 하위경로 빌드 설계

날짜: 2026-07-10
상태: 사용자 검토 대기

## 배경 / 문제

git 레포 점검 파이프라인의 build 단계가 **레포 루트의 `Dockerfile` 한 곳만** 확인한다. 루트에
Dockerfile이 없으면(하위 경로에 있거나 이름이 변형된 경우) 실제로는 빌드 가능한 레포인데도
무조건 실패한다.

실제 발생 사례: run `c631640e-672d-4812-9906-4175dbae5fe5`, 레포 `github.com/blueskytto/ocpm`
— clone 성공 후 build 단계에서 `"Dockerfile을 찾을 수 없습니다 (레포 루트 기준)"`로 실패.

### 현재 코드

- `src/lib/pipeline/dockerfile.ts` `detectDockerfile(repoDir)`: `<repoDir>/Dockerfile`만 `existsSync`,
  없으면 `undefined`.
- `src/lib/pipeline/orchestrator.ts:100-110`: `undefined`면 build 단계를 즉시 실패 처리.
- `src/lib/pipeline/build.ts` `buildImage(repoDir, imageTag)`: `docker build -t <tag> <repoDir>` —
  도커 기본값(`<repoDir>/Dockerfile`)으로 빌드하므로, 탐색만 고쳐도 하위경로 Dockerfile로는 빌드가 안 됨.
  빌드 함수도 함께 고쳐야 한다.

## 목표

레포 트리를 자동 탐색해 Dockerfile(및 흔한 변형명)을 찾고, 루트가 아닌 위치의 Dockerfile로도
이미지를 빌드해 점검을 진행한다. 순수 UI가 아닌 파이프라인 동작 개선이며, 기존 루트 Dockerfile
케이스의 동작은 100% 보존한다.

## 범위

**포함**: 레포 트리 전체에서 Dockerfile류 탐색, 다중 발견 시 결정적 자동 선택, 하위경로 Dockerfile 빌드,
선택된 경로를 점검 결과에 노출.

**제외(이번 범위 아님, 사용자 확정)**:
- docker-compose.yml / pre-built 이미지 참조 탐색 (Dockerfile이 아예 없는 레포 대응).
- 발견된 여러 Dockerfile 중 사용자가 수동 선택하는 UI.

## 설계

### 1. `detectDockerfile(repoDir)` 재작성 — `src/lib/pipeline/dockerfile.ts`

레포 트리를 재귀 탐색해 후보를 수집하고, 결정적 순위로 하나를 선택한다.

**매칭 규칙** (파일명 기준, 대소문자 무시):
- 정확히 `Dockerfile`
- `Dockerfile.<suffix>` (예: `Dockerfile.prod`, `Dockerfile.dev`)
- `<prefix>.Dockerfile` (예: `app.Dockerfile`)

**제외 디렉터리** (트리 진입 안 함): `.git`, `node_modules`, `vendor`, `.next`, `dist`, `build`.
벤더/빌드 산출물 안의 예제 Dockerfile 오탐 방지.

**견고성**:
- 심볼릭 링크는 따라가지 않는다(`fs.readdirSync(..., { withFileTypes: true })`로 판별, 심링크 디렉터리 건너뜀).
- 권한 오류 등 `readdir` 실패 디렉터리는 건너뛴다(전체 탐색을 중단시키지 않음).
- 탐색 상한: 최대 깊이 `MAX_DEPTH = 8`, 최대 방문 엔트리 `MAX_ENTRIES = 20000`. 상한 도달 시
  그때까지 수집한 후보로 선택(병리적/거대 레포 방어).

**선택 순위** (오름차순 정렬 후 첫 번째):
1. 깊이 얕은 것 우선 (루트 = 0)
2. 같은 깊이면 정확한 이름 `Dockerfile`을 변형명보다 우선
3. 그래도 동률이면 경로 문자열 사전순

**반환**: 선택된 절대 경로 `string`, 후보 없으면 `undefined` (기존 시그니처 유지).

### 2. `buildImage` 시그니처 변경 — `src/lib/pipeline/build.ts`

```
buildImage(repoDir: string, dockerfilePath: string, imageTag: string): Promise<void>
```

실행: `docker build -t <imageTag> -f <dockerfilePath> <repoDir>`

**빌드 컨텍스트는 레포 루트(`repoDir`) 유지.** 근거:
- 현재도 컨텍스트가 `repoDir`이므로 루트 Dockerfile 케이스가 완전히 보존된다
  (`-f <repoDir>/Dockerfile <repoDir>`는 기존 기본 동작과 동일).
- 하위 경로 Dockerfile이 루트 파일을 `COPY`하는 모노레포 패턴(흔함)도 깨지지 않는다.
- 변경은 `-f <dockerfilePath>` 인자 추가뿐 — 최소 변경.

`removeImage`는 변경 없음.

### 3. `orchestrator.ts` 연결 — `src/lib/pipeline/orchestrator.ts`

- `dockerfilePath = deps.detectDockerfile(repoDir)` (동일). 이제 하위경로도 반환됨.
- `undefined`면 실패 메시지를 `"Dockerfile을 찾을 수 없습니다 (레포 전체 탐색)"`로 갱신
  (더 이상 루트 한정이 아님).
- build 호출을 `deps.build(repoDir, dockerfilePath, imageTag)`로 변경
  (`OrchestratorDeps`의 `build` 타입도 함께 갱신).
- build 성공 시 stage 메시지에 선택된 상대 경로 포함:
  `updateRunStage(runId, "build", "succeeded", { imageTag, message: \`Dockerfile: ${path.relative(repoDir, dockerfilePath)}\` }, db)`.
  → 진행 현황·리포트 화면에 어떤 Dockerfile이 선택됐는지 노출.
- `dockerfilePath`는 이후 `runChecks(dockerfilePath, ...)`에도 그대로 전달됨(정적 Dockerfile 분석) — 변경 없음.

## 테스트 (TDD)

**`src/lib/pipeline/dockerfile.test.ts`** (신규 또는 기존에 추가):
- 루트 `Dockerfile` → 그 경로 반환
- 하위 경로만 있음(`docker/Dockerfile`) → 그 경로 반환
- 변형명만 있음(`Dockerfile.prod`) → 그 경로 반환
- 다중: 루트 + 하위 → 루트 선택
- 다중: 같은 깊이 `a/Dockerfile` + `b/Dockerfile.dev` → 정확한 이름 `a/Dockerfile` 선택
- 다중: 같은 깊이·같은 종류 → 사전순 첫 번째
- 없음 → `undefined`
- 제외 디렉터리(`node_modules/foo/Dockerfile`) → 무시(다른 후보 없으면 `undefined`)

**`src/lib/pipeline/build.test.ts`** (신규 또는 기존에 추가):
- `buildImage`가 `docker build -t <tag> -f <dockerfilePath> <repoDir>` 인자로 execFile 호출하는지
  (execFile 모킹/주입으로 인자 검증).

**orchestrator 테스트**:
- 기존 dep 주입 테스트에 하위경로 Dockerfile 케이스 추가 — `detectDockerfile`가 하위경로를 반환할 때
  `build`가 그 경로로 호출되고 파이프라인이 진행되는지, build 성공 메시지에 상대 경로가 담기는지.

## 검증

- `source ~/.nvm/nvm.sh && nvm use v24.16.0 && npm test` 전체 통과(기존 672 + 신규).
- `npm run lint`(테스트 파일 포함) / `npx tsc --noEmit` 통과.
- dev 서버에서 실제로 하위경로 Dockerfile 레포(예: ocpm 계열) 재점검 시 build 단계가 통과하고
  선택된 Dockerfile 경로가 화면에 표시되는지 확인.

## 회귀 방지

- 루트 Dockerfile 레포: 탐색 순위상 항상 루트가 먼저 선택 + 컨텍스트=repoDir 유지 → 기존과 동일하게 동작.
- `local_image` 소스 경로: Dockerfile 탐색/빌드 자체를 건너뛰므로 영향 없음.
