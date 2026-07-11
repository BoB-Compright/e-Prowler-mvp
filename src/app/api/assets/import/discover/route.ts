import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { requireApiSession } from "@/lib/auth/requireSession";
import { cloneRepo } from "@/lib/pipeline/clone";
import { listDockerfiles, dockerfileBuildBlockers } from "@/lib/pipeline/dockerfile";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";
import { listRepoAssetsByRepoUrl } from "@/lib/assets/store";
import { getProject } from "@/lib/projects/store";

// Shallow-clones repoUrl into a temp dir, lists every Dockerfile-like file in
// it, and returns their repo-root-relative paths so the caller can let the
// user pick which one(s) to import as image assets. The clone is scratch
// space only — it is always removed in `finally`, on both success and error.
// Dockerfile paths already registered as assets are reported in `registered`
// (path → owning project) so the form can steer the user to the existing
// project instead of letting them re-import into a new empty one.
export async function POST(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
  if (!isValidRepoUrl(repoUrl)) {
    return NextResponse.json({ error: "유효하지 않은 레포 URL입니다" }, { status: 400 });
  }

  const tmpId = `import-${randomUUID()}`;
  let dir: string | undefined;
  try {
    const result = await cloneRepo(repoUrl, tmpId);
    dir = result.dir;
    const abs = listDockerfiles(dir);
    const dockerfiles = abs.map((p) => path.relative(dir!, p));

    // build-arg 없이는 빌드 불가한 Dockerfile(예: FROM ${BASE_IMAGE})을 표시해
    // 선택에서 제외할 수 있게 한다(path → 필요한 인자명 목록).
    const buildBlocked: Record<string, string[]> = {};
    for (let i = 0; i < abs.length; i++) {
      let content = "";
      try {
        content = fs.readFileSync(abs[i], "utf8");
      } catch {
        continue;
      }
      const blockers = dockerfileBuildBlockers(content);
      if (blockers.length > 0) buildBlocked[dockerfiles[i]] = blockers;
    }

    const existingByPath = new Map(
      listRepoAssetsByRepoUrl(repoUrl).map((a) => [a.dockerfilePath, a]),
    );
    const registered: Record<string, { projectId: string | null; projectName: string | null }> = {};
    for (const dfPath of dockerfiles) {
      const asset = existingByPath.get(dfPath);
      if (!asset) continue;
      const project = asset.projectId ? getProject(asset.projectId) : undefined;
      registered[dfPath] = {
        projectId: asset.projectId,
        projectName: project?.name ?? null,
      };
    }

    return NextResponse.json({ dockerfiles, registered, buildBlocked });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "레포를 가져오지 못했습니다" },
      { status: 400 },
    );
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}
