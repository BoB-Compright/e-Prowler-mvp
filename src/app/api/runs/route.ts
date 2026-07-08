import { NextRequest, NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/pipeline/runs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { listLocalImages } from "@/lib/pipeline/localImages";
import { getAsset } from "@/lib/assets/store";

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

  // 레포 URL 직접입력 대신 등록된 자산 선택
  const assetId = typeof body?.assetId === "string" ? body.assetId : "";
  const asset = getAsset(assetId);
  if (!asset) {
    return NextResponse.json({ error: "유효한 자산을 선택하세요" }, { status: 400 });
  }
  if (asset.type === "server") {
    return NextResponse.json(
      { error: "서버 자산 점검 실행은 아직 지원되지 않습니다 (A2에서 제공 예정)" },
      { status: 501 },
    );
  }

  const run = createRun(asset.repoUrl!, "git", asset.id);

  // Fire-and-forget: the pipeline runs in the background on this same
  // long-lived Node process (local single-user MVP), the client polls
  // GET /api/runs/[id] for progress instead of blocking this request.
  void runPipeline(run.id, { type: "git", repoUrl: asset.repoUrl! });

  return NextResponse.json({ run }, { status: 202 });
}
