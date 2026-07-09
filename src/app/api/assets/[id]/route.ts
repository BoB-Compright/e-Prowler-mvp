import { NextResponse } from "next/server";
import { AssetInUseError, deleteAsset, getAsset } from "@/lib/assets/store";
import { requireApiSession } from "@/lib/auth/requireSession";
import { listRuns } from "@/lib/pipeline/runs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
  const runs = listRuns().filter((run) => run.assetId === id);
  return NextResponse.json({ asset, runs });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetInUseError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
