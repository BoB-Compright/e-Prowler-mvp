import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function buildImage(repoDir: string, imageTag: string): Promise<void> {
  await execFileAsync("docker", ["build", "-t", imageTag, repoDir], {
    timeout: 300_000,
    maxBuffer: 1024 * 1024 * 10,
  });
}
