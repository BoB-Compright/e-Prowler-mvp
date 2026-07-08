import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface LocalImage {
  tag: string; // "repository:tag"
  id: string;
  size: string;
  createdSince: string;
}

// Lists images already present in the local Docker daemon so the fallback
// path (#41) can re-scan one without clone/build when those steps fail.
// Dangling build layers ("<none>:<none>") aren't a usable scan target.
export async function listLocalImages(): Promise<LocalImage[]> {
  const { stdout } = await execFileAsync("docker", [
    "images",
    "--format",
    "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}",
  ]);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [repository, tag, id, size, createdSince] = line.split("\t");
      return { tag: `${repository}:${tag}`, id, size, createdSince };
    })
    .filter((image) => !image.tag.startsWith("<none>"));
}
