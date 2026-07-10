import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { createProject } from "@/lib/projects/store";
import { createRepoAsset, DuplicateAssetError } from "@/lib/assets/store";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";

function repoName(repoUrl: string): string {
  const last = repoUrl.replace(/\.git$/, "").split("/").filter(Boolean).pop() ?? "repo";
  return last;
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
  const dockerfilePaths: string[] = Array.isArray(body?.dockerfilePaths)
    ? body.dockerfilePaths.filter((p: unknown): p is string => typeof p === "string" && p.trim() !== "")
    : [];

  if (!isValidRepoUrl(repoUrl)) {
    return NextResponse.json({ error: "유효하지 않은 레포 URL입니다" }, { status: 400 });
  }
  if (!projectName) {
    return NextResponse.json({ error: "프로젝트명을 입력하세요" }, { status: 400 });
  }
  if (dockerfilePaths.length === 0) {
    return NextResponse.json({ error: "이미지를 하나 이상 선택하세요" }, { status: 400 });
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
