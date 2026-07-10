import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export async function buildImage(dockerfilePath: string, imageTag: string): Promise<void> {
  // 컨텍스트 = Dockerfile이 있는 디렉터리 (자기완결형 하위 서비스 Dockerfile 지원).
  // 루트 Dockerfile이면 dirname == repoDir 이라 기존 동작과 동일.
  const contextDir = path.dirname(dockerfilePath);
  await execFileAsync("docker", ["build", "-t", imageTag, "-f", dockerfilePath, contextDir], {
    timeout: 300_000,
    maxBuffer: 1024 * 1024 * 10,
  });
}

// Removes a one-off `scan-<runId>` image built for a single git-sourced run
// (see orchestrator.ts) once the sandbox/ansible stages are done with it --
// otherwise every run permanently accumulates its own image, and repeated
// runs share no history the way `docker build`'s layer cache would suggest
// (a fresh clone/build tags a brand-new image every time). Never called for
// local_image-sourced runs, which reuse an image the user owns.
export async function removeImage(imageTag: string): Promise<void> {
  await execFileAsync("docker", ["rmi", "-f", imageTag], { timeout: 15_000 }).catch(() => undefined);
}
