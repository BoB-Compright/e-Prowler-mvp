import { NextRequest, NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/pipeline/runs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { createServerRun, runServerScanPipeline } from "@/lib/pipeline/serverScan";
import { listLocalImages } from "@/lib/pipeline/localImages";
import { getAsset } from "@/lib/assets/store";
import { requireApiSession } from "@/lib/auth/requireSession";
import { isValidRepoUrl } from "@/lib/pipeline/repoUrl";
import { hasActiveRun } from "@/lib/scheduling/trigger";

export function GET(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

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

  // 리포트/자산 화면의 재스캔 버튼과 스케줄러 모두 이 경로를 타므로, 동일 자산에
  // 이미 진행 중인 run이 있으면 중복 시작 대신 409로 안내한다 (#75).
  if (hasActiveRun(asset.id)) {
    return NextResponse.json(
      { error: "이미 진행 중인 점검이 있습니다" },
      { status: 409 },
    );
  }

  const categories = Array.isArray(body?.categories)
    ? body.categories.filter((c: unknown): c is string => typeof c === "string")
    : undefined;

  if (asset.type === "server") {
    // Same fire-and-forget shape as the git path below: the run row is
    // created synchronously so we can respond with its id right away, and
    // the actual SSH/ansible scan (which can take minutes) runs in the
    // background on this same long-lived process.
    const { run, asset: serverAsset } = createServerRun(asset.id, null);
    void runServerScanPipeline(run, serverAsset, undefined, undefined, { categories });
    return NextResponse.json({ run }, { status: 202 });
  }

  if (!isValidRepoUrl(asset.repoUrl!)) {
    return NextResponse.json({ error: "유효하지 않은 레포 URL입니다" }, { status: 400 });
  }

  const run = createRun(asset.repoUrl!, "git", asset.id);

  // Fire-and-forget: the pipeline runs in the background on this same
  // long-lived Node process (local single-user MVP), the client polls
  // GET /api/runs/[id] for progress instead of blocking this request.
  void runPipeline(
    run.id,
    {
      type: "git",
      repoUrl: asset.repoUrl!,
      ...(asset.dockerfilePath ? { dockerfilePath: asset.dockerfilePath } : {}),
    },
    undefined,
    undefined,
    { categories },
  );

  return NextResponse.json({ run }, { status: 202 });
}
