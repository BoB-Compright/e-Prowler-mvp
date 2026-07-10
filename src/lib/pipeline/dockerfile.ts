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

// 레포 트리를 재귀 탐색해 Dockerfile류 후보를 전부 수집하고, 결정적 순위로 하나를 고른다.
// 순위: 얕은 깊이 → 정확한 이름 우선 → 경로 사전순.
export function detectDockerfile(repoDir: string): string | undefined {
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
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return a.absPath < b.absPath ? -1 : a.absPath > b.absPath ? 1 : 0;
  });
  return candidates[0].absPath;
}
