import fs from "fs";
import path from "path";

export function detectDockerfile(repoDir: string): string | undefined {
  const candidate = path.join(repoDir, "Dockerfile");
  return fs.existsSync(candidate) ? candidate : undefined;
}
