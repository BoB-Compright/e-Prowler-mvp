import fs from "fs";
import path from "path";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "vendor", ".next", "dist", "build"]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 20000;

// Dockerfile류가 아닌 흔한 확장자 (변형명 오탐 방지, 대소문자 무시 비교).
const NON_DOCKERFILE_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".jsx",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".md",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".yml",
  ".yaml",
  ".json",
  ".sh",
  ".lock",
  ".log",
  ".html",
  ".css",
]);

// 파일명이 Dockerfile / Dockerfile.<suffix> / <prefix>.Dockerfile 인지 (대소문자 무시).
// 단, Dockerfile.<suffix> / <prefix>.Dockerfile 변형은 확장자가 데니리스트에 있으면 제외한다
// (예: Dockerfile.md, dockerfile.ts). app.Dockerfile은 확장자가 ".dockerfile"이라 데니리스트에
// 없으므로 그대로 매치된다.
function isDockerfileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return true;
  const isVariant = lower.startsWith("dockerfile.") || lower.endsWith(".dockerfile");
  if (!isVariant) return false;
  const ext = path.extname(lower);
  return !NON_DOCKERFILE_EXTENSIONS.has(ext);
}

interface Candidate {
  absPath: string;
  depth: number;
  exact: boolean; // 파일명이 정확히 "Dockerfile"(대소문자 무시)인가
}

// 레포 트리를 재귀 탐색해 Dockerfile류 후보를 전부 수집하고, 결정적 순위로 정렬해 반환한다.
// 순위: 얕은 깊이 → 정확한 이름 우선 → 경로 사전순.
export function listDockerfiles(repoDir: string): string[] {
  const candidates: Candidate[] = [];
  let visited = 0;

  // 2-패스 탐색: 같은 깊이의 파일 후보를 전부 수집한 뒤에 하위 디렉터리로 재귀한다.
  // readdirSync 순서는 파일시스템에 따라 달라지므로, 디렉터리를 파일보다 먼저 만나
  // 그대로 재귀해버리면 거대한 하위 트리 안에서 MAX_ENTRIES 상한에 먼저 도달해
  // 같은 디렉터리의 (더 얕은) Dockerfile을 영영 못 볼 수 있다. 파일 우선 수집으로
  // 얕은 후보(특히 루트 Dockerfile)가 상한 도달 여부와 무관하게 항상 먼저 수집되게 한다.
  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH || visited >= MAX_ENTRIES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 권한 오류 등은 해당 디렉터리만 건너뜀
    }

    const subdirNames: string[] = [];

    // 1패스: 파일 후보 수집 + 재귀 대상 하위 디렉터리 기록 (재귀는 아직 안 함)
    for (const entry of entries) {
      if (visited >= MAX_ENTRIES) return;
      visited++;
      if (entry.isSymbolicLink()) continue; // 심링크는 따라가지 않음(루프 방지)
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        subdirNames.push(entry.name);
      } else if (entry.isFile() && isDockerfileName(entry.name)) {
        candidates.push({
          absPath: path.join(dir, entry.name),
          depth,
          exact: entry.name.toLowerCase() === "dockerfile",
        });
      }
    }

    // 2패스: 이 디렉터리의 파일을 모두 본 뒤에야 하위 디렉터리로 재귀
    for (const name of subdirNames) {
      if (visited >= MAX_ENTRIES) return;
      walk(path.join(dir, name), depth + 1);
    }
  }

  walk(repoDir, 0);

  candidates.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return a.absPath < b.absPath ? -1 : a.absPath > b.absPath ? 1 : 0;
  });
  return candidates.map((c) => c.absPath);
}

// repoDir에서 선택순위가 가장 높은 Dockerfile류 후보 하나를 고른다.
export function detectDockerfile(repoDir: string): string | undefined {
  return listDockerfiles(repoDir)[0];
}

// Dockerfile 내용을 보고, `docker build`를 build-arg 없이 실행하면 실패하게 만드는
// "빌드 차단 인자" 이름들을 반환한다(빈 배열 = 표준 빌드 가능).
//
// 대상: FROM 이미지 참조가 `${VAR}`/`$VAR`를 쓰는데 그 VAR가 기본값 있는 ARG로
// 선언돼 있지 않은 경우 — build-arg를 넘기지 않으면 base name이 빈 값이 되어
// "base name (${VAR}) should not be blank"로 빌드가 거부된다(예: old/Dockerfile.vada).
// 기본값이 있는 ARG(FROM ${BASE:-ubuntu} 또는 ARG BASE=ubuntu)는 차단으로 보지 않는다.
// 멀티스테이지의 `FROM builder`처럼 변수 없는 스테이지 참조는 애초에 매치되지 않는다.
export function dockerfileBuildBlockers(content: string): string[] {
  const argsWithDefault = new Set<string>();
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const m = /^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)(=(.*))?\s*$/i.exec(line);
    if (m && m[2] !== undefined && (m[3] ?? "").trim() !== "") {
      argsWithDefault.add(m[1]);
    }
  }

  const blockers = new Set<string>();
  for (const line of lines) {
    const from = /^\s*FROM\s+(\S+)/i.exec(line);
    if (!from) continue;
    // ${VAR}, ${VAR:-default}, $VAR 형태의 참조를 찾는다.
    for (const vm of from[1].matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}?/g)) {
      const name = vm[1];
      const hasInlineDefault = vm[2] !== undefined; // ${VAR:-...}
      if (!hasInlineDefault && !argsWithDefault.has(name)) blockers.add(name);
    }
  }
  return [...blockers];
}

// COPY/ADD가 참조하는 로컬 소스 파일이 빌드 컨텍스트(=Dockerfile이 있는 디렉터리,
// buildImage 참고)에 없으면 그 소스 경로들을 반환한다(빈 배열 = 문제 없음).
// 이런 Dockerfile은 레포에 커밋되지 않은 빌드 산출물(예: COPY VADA_Agent_LINUX.tar)을
// 기대하므로, 깨끗한 클론에서 `docker build` 시 "not found"로 실패한다.
//
// 오탐을 피하려고, 원격 소스(ADD http://…), 변수 포함($…), 와일드카드(*?[]) 소스와
// `COPY --from=<stage/image>`는 검사 대상에서 제외한다(존재 확신이 어려운 경우 통과).
export function dockerfileMissingSources(content: string, contextDir: string): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  const contextRoot = path.resolve(contextDir);

  for (const raw of content.split(/\r?\n/)) {
    const m = /^\s*(COPY|ADD)\s+(.+)$/i.exec(raw);
    if (!m) continue;

    const argStr = m[2].trim();
    let tokens: string[];
    if (argStr.startsWith("[")) {
      try {
        tokens = JSON.parse(argStr) as string[];
      } catch {
        continue;
      }
    } else {
      tokens = argStr.split(/\s+/);
    }

    // --from=... 는 빌드 스테이지/이미지에서 복사 → 컨텍스트 파일이 아님, 스킵.
    if (tokens.some((t) => /^--from=/i.test(t))) continue;
    const flagless = tokens.filter((t) => !t.startsWith("--"));
    if (flagless.length < 2) continue; // 최소 소스 1 + 목적지 1

    for (const src of flagless.slice(0, -1)) {
      if (src.includes("://")) continue; // 원격 ADD
      if (src.includes("$")) continue; // 변수 — 확인 불가
      if (/[*?[\]]/.test(src)) continue; // 와일드카드 — 오탐 방지 위해 스킵
      const abs = path.resolve(contextRoot, src);
      if (!abs.startsWith(contextRoot)) continue; // 컨텍스트 밖(정상 빌드에선 불가) — 스킵
      if (!fs.existsSync(abs) && !seen.has(src)) {
        seen.add(src);
        missing.push(src);
      }
    }
  }
  return missing;
}
