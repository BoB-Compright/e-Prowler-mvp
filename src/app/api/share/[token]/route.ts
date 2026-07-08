import { NextRequest, NextResponse } from "next/server";
import { verifyShareAccess } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const result = verifyShareAccess(token, password);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "locked" ? 423 : 401;
    return NextResponse.json({ error: result.reason }, { status });
  }

  const assets = listAssets({ projectId: result.project.id });
  const assetIds = new Set(assets.map((asset) => asset.id));
  const runs = listRuns().filter((run) => run.assetId && assetIds.has(run.assetId));

  const publicProject = { name: result.project.name, pmName: result.project.pmName };
  const publicAssets = assets.map((asset) => ({
    id: asset.id,
    displayName: asset.displayName,
    type: asset.type,
  }));
  const publicRuns = runs.map((run) => ({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    assetId: run.assetId,
  }));

  return NextResponse.json({ project: publicProject, assets: publicAssets, runs: publicRuns });
}
