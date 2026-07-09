import { NextRequest, NextResponse } from "next/server";
import { verifyShareAccess } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const result = verifyShareAccess(token, password);
  if (!result.ok) {
    const status =
      result.reason === "not_found"
        ? 404
        : result.reason === "disabled" || result.reason === "revoked"
          ? 403
          : result.reason === "locked"
            ? 423
            : 401;
    return NextResponse.json({ error: result.reason }, { status });
  }

  const assets = listAssets({ projectId: result.project.id });
  const assetIds = new Set(assets.map((asset) => asset.id));
  const runs = listRuns().filter((run) => run.assetId && assetIds.has(run.assetId));

  // 공유 뷰는 자산별 "판정 배지"까지만 노출한다 (#72 제품 결정) — 건수·항목별
  // 상세·CVE 내역 등 그 외 필드는 계속 비노출. getAssetStatusMap()은 내부
  // 대시보드(자산 관리 화면)와 동일한 판정 규칙을 사용하므로 재사용한다.
  const statusMap = getAssetStatusMap();

  const publicProject = { name: result.project.name, pmName: result.project.pmName };
  const publicAssets = assets.map((asset) => ({
    id: asset.id,
    displayName: asset.displayName,
    type: asset.type,
    verdict: statusMap.get(asset.id)?.kind ?? "none",
  }));
  const publicRuns = runs.map((run) => ({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    assetId: run.assetId,
  }));

  return NextResponse.json({ project: publicProject, assets: publicAssets, runs: publicRuns });
}
