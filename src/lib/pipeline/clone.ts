import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

export interface CloneResult {
  dir: string;
}

// Shallow-clones repoUrl into workRoot/<runId>. Uses execFile (no shell) so
// repoUrl can never be interpreted as a shell command.
export async function cloneRepo(
  repoUrl: string,
  runId: string,
  workRoot = path.join(process.cwd(), "data", "repos"),
): Promise<CloneResult> {
  const dir = path.join(workRoot, runId);
  fs.mkdirSync(workRoot, { recursive: true });
  await execFileAsync("git", ["clone", "--depth", "1", repoUrl, dir], {
    timeout: 60_000,
  });
  return { dir };
}
