import { NextRequest, NextResponse } from "next/server";
import { verifyShareAccess } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { getAssetStatusMap } from "@/lib/pipeline/assetStatus";
import { listCheckResults } from "@/lib/checks/store";
import { getCatalogItem, getMitigation } from "@/lib/catalog";

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

  // 공유 뷰 노출 정책: 자산별 판정 배지 + (조치 가이드용) 취약·검토 항목의
  // id·제목·심각도·조치 가이드까지 노출한다(PM이 조치 판단할 수 있도록 — findings).
  // evidence 원문·CVE 내역은 계속 비노출. getAssetStatusMap()은 내부 대시보드와
  // 동일한 판정 규칙을 사용하므로 재사용한다.
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

  // 자산별 최근 성공 run의 취약·검토 항목 + 정적 조치 가이드. evidence 원문·CVE는 비노출.
  const findings = assets.map((asset) => {
    const latest = runs
      .filter((r) => r.assetId === asset.id && r.status === "succeeded")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return { assetId: asset.id, items: [] };
    const items = listCheckResults(latest.id)
      .filter((c) => c.status === "fail" || c.status === "review")
      .map((c) => ({
        id: c.id,
        title: getCatalogItem(c.id)?.title ?? c.id,
        severity: getCatalogItem(c.id)?.severity ?? null,
        status: c.status as "fail" | "review",
        mitigation: getMitigation(c.id),
      }));
    return { assetId: asset.id, items };
  });

  return NextResponse.json({ project: publicProject, assets: publicAssets, runs: publicRuns, findings });
}
