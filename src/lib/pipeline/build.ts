import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function buildImage(repoDir: string, imageTag: string): Promise<void> {
  await execFileAsync("docker", ["build", "-t", imageTag, repoDir], {
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
