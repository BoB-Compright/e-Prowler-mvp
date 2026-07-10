import fs from "fs";
import path from "path";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "vendor", ".next", "dist", "build"]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 20000;

// 파일명이 Dockerfile / Dockerfile.<suffix> / <prefix>.Dockerfile 인지 (대소문자 무시).
function isDockerfileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "dockerfile" || lower.startsWith("dockerfile.") || lower.endsWith(".dockerfile");
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

  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH || visited >= MAX_ENTRIES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 권한 오류 등은 해당 디렉터리만 건너뜀
    }
    for (const entry of entries) {
      if (visited >= MAX_ENTRIES) return;
      visited++;
      if (entry.isSymbolicLink()) continue; // 심링크는 따라가지 않음(루프 방지)
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && isDockerfileName(entry.name)) {
        candidates.push({
          absPath: path.join(dir, entry.name),
          depth,
          exact: entry.name.toLowerCase() === "dockerfile",
        });
      }
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
