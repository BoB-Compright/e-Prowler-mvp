import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { requireApiSession } from "@/lib/auth/requireSession";
import { cloneRepo } from "@/lib/pipeline/clone";
import { listDockerfiles } from "@/lib/pipeline/dockerfile";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";

// Shallow-clones repoUrl into a temp dir, lists every Dockerfile-like file in
// it, and returns their repo-root-relative paths so the caller can let the
// user pick which one(s) to import as image assets. The clone is scratch
// space only — it is always removed in `finally`, on both success and error.
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
    return NextResponse.json({ dockerfiles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "레포를 가져오지 못했습니다" },
      { status: 400 },
    );
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}
