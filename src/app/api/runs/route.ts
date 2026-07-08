import { NextRequest, NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/pipeline/runs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";
import { listLocalImages } from "@/lib/pipeline/localImages";

export function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const imageTag = typeof body?.imageTag === "string" ? body.imageTag.trim() : "";

  // Fallback path (#41): scan an already-built local image directly,
  // skipping clone/build. Re-checking against the live image list (rather
  // than trusting the client) keeps this from being an arbitrary `docker run`.
  if (imageTag) {
    const localImages = await listLocalImages().catch(() => []);
    if (!localImages.some((image) => image.tag === imageTag)) {
      return NextResponse.json({ error: "로컬에 존재하지 않는 이미지입니다" }, { status: 400 });
    }

    const run = createRun(imageTag, "local_image");
    void runPipeline(run.id, { type: "local_image", imageTag });
    return NextResponse.json({ run }, { status: 202 });
  }

  const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
  if (!isValidRepoUrl(repoUrl)) {
    return NextResponse.json({ error: "유효한 레포 URL이 아닙니다" }, { status: 400 });
  }

  const run = createRun(repoUrl);

  // Fire-and-forget: the pipeline runs in the background on this same
  // long-lived Node process (local single-user MVP), the client polls
  // GET /api/runs/[id] for progress instead of blocking this request.
  void runPipeline(run.id, { type: "git", repoUrl });

  return NextResponse.json({ run }, { status: 202 });
}
