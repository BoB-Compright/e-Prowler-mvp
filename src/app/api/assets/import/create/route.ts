import { randomBytes } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { createProject } from "@/lib/projects/store";
import { createRepoAsset, DuplicateAssetError } from "@/lib/assets/store";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";

function repoName(repoUrl: string): string {
  const last = repoUrl.replace(/\.git$/, "").split("/").filter(Boolean).pop() ?? "repo";
  return last;
}

// Rejects any path that is absolute or escapes the repo root once
// normalized, so `path.join(repoDir, dockerfilePath)` downstream (in the
// orchestrator) can never land outside the cloned repo. Returns the
// trimmed, normalized, still-relative path, or null if invalid.
function sanitizeDockerfilePath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const norm = path.normalize(trimmed);
  if (path.isAbsolute(norm)) return null;
  if (norm === ".." || norm.startsWith(".." + path.sep)) return null;
  return norm;
}

// Creates one project plus one repo asset per selected Dockerfile path. The
// import flow never collects PM info, so the project is created with
// placeholder pmName/pmEmail/sharePassword — these are editable later via the
// project UI, and the random share password is never logged or returned.
export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
  const projectName = typeof body?.projectName === "string" ? body.projectName.trim() : "";
  const rawDockerfilePaths: string[] = Array.isArray(body?.dockerfilePaths)
    ? body.dockerfilePaths.filter((p: unknown): p is string => typeof p === "string")
    : [];
  const dockerfilePaths: string[] = rawDockerfilePaths
    .map(sanitizeDockerfilePath)
    .filter((p): p is string => p !== null);

  if (!isValidRepoUrl(repoUrl)) {
    return NextResponse.json({ error: "유효하지 않은 레포 URL입니다" }, { status: 400 });
  }
  if (!projectName) {
    return NextResponse.json({ error: "프로젝트명을 입력하세요" }, { status: 400 });
  }
  if (rawDockerfilePaths.length === 0) {
    return NextResponse.json({ error: "이미지를 하나 이상 선택하세요" }, { status: 400 });
  }
  if (dockerfilePaths.length === 0) {
    return NextResponse.json({ error: "유효한 Dockerfile 경로가 없습니다" }, { status: 400 });
  }

  const project = createProject({
    name: projectName,
    pmName: projectName,
    pmEmail: "",
    sharePassword: randomBytes(12).toString("base64url"),
  });

  const name = repoName(repoUrl);
  let created = 0;
  const skipped: string[] = [];
  for (const dfPath of dockerfilePaths) {
    try {
      createRepoAsset({
        displayName: `${name} / ${dfPath}`,
        repoUrl,
        projectId: project.id,
        dockerfilePath: dfPath,
      });
      created++;
    } catch (err) {
      if (err instanceof DuplicateAssetError) {
        skipped.push(dfPath);
        continue;
      }
      throw err;
    }
  }

  return NextResponse.json({ projectId: project.id, created, skipped }, { status: 201 });
}
