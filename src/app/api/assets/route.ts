import { NextRequest, NextResponse } from "next/server";
import { DuplicateAssetError, createRepoAsset, createServerAsset, listAssets } from "@/lib/assets/store";
import { isValidCategory } from "@/lib/assets/categories";
import { requireApiSession } from "@/lib/auth/requireSession";
import { getVendorInputSpecs } from "@/lib/packs/registry";
import { encodeScanInputs } from "@/lib/assets/scanInputs";

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function GET(req: NextRequest) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const projectIdParam = req.nextUrl.searchParams.get("projectId");
  const typeParam = req.nextUrl.searchParams.get("type");
  const filter: Parameters<typeof listAssets>[0] = {};
  if (projectIdParam !== null) {
    filter.projectId = projectIdParam === "unassigned" ? null : projectIdParam;
  }
  if (typeParam === "repo" || typeParam === "server") {
    filter.type = typeParam;
  }
  return NextResponse.json({ assets: listAssets(filter) });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const type = body?.type;
  try {
    if (type === "repo") {
      const asset = createRepoAsset({
        displayName: String(body.displayName ?? ""),
        repoUrl: String(body.repoUrl ?? ""),
        projectId: body.projectId || null,
        os: optionalString(body.os),
        owner: optionalString(body.owner),
        dockerfilePath: optionalString(body.dockerfilePath),
      });
      return NextResponse.json({ asset }, { status: 201 });
    }
    if (type === "server") {
      const category = isValidCategory(body.category) ? body.category : null;
      const vendor = optionalString(body.vendor);
      const rawInputs =
        body?.scanInputs && typeof body.scanInputs === "object" ? (body.scanInputs as Record<string, string>) : {};
      const specs = category && vendor ? getVendorInputSpecs(category, vendor) : [];
      const scanInputs = specs.length ? encodeScanInputs(specs, rawInputs) : undefined;
      const asset = createServerAsset({
        displayName: String(body.displayName ?? ""),
        hostIp: String(body.hostIp ?? ""),
        hostname: String(body.hostname ?? ""),
        sshPort: Number(body.sshPort),
        authType: body.authType,
        username: String(body.username ?? ""),
        secret: String(body.secret ?? ""),
        projectId: body.projectId || null,
        os: optionalString(body.os),
        owner: optionalString(body.owner),
        category,
        vendor,
        scanInputs,
      });
      return NextResponse.json({ asset }, { status: 201 });
    }
    return NextResponse.json({ error: "type은 repo 또는 server여야 합니다" }, { status: 400 });
  } catch (error) {
    if (error instanceof DuplicateAssetError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
