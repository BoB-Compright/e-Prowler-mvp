import { NextRequest, NextResponse } from "next/server";
import { verifyShareAccess } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";
import { getDecoratedResults } from "@/lib/checks/decorate";

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

  // 공유 뷰 노출 정책: 자산별 판정 배지 + 자산별 최신 성공 run의 전체 데코 점검
  // 항목(pass 포함, evidence·reason 노출 — PM 풀리포트용 perAsset). CVE 매치
  // 내역은 getDecoratedResults가 애초에 반환하지 않으므로 계속 비노출.
  // getAssetStatusMap()은 내부 대시보드와 동일한 판정 규칙을 사용하므로 재사용한다.
  const statusMap = getAssetStatusMap();

  const publicProject = { name: result.project.name, pmName: result.project.pmName };
  const publicAssets = assets.map((asset) => ({
    id: asset.id,
    displayName: asset.displayName,
    type: asset.type,
    verdict: statusMap.get(asset.id)?.kind ?? "none",
  }));
  // 자산별 최신 성공 run의 전체 데코 점검 항목(pass 포함, evidence·reason 노출).
  // getDecoratedResults는 CVE 매치 내역을 애초에 반환하지 않으므로 계속 비노출.
  const perAsset = assets.map((asset) => {
    const latest = runs
      .filter((r) => r.assetId === asset.id && r.status === "succeeded")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return { assetId: asset.id, run: null, checks: [] };
    return {
      assetId: asset.id,
      run: { id: latest.id, createdAt: latest.createdAt, repoUrl: latest.repoUrl },
      checks: getDecoratedResults(latest.id),
    };
  });

  return NextResponse.json({ project: publicProject, assets: publicAssets, perAsset });
}
