import { NextResponse } from "next/server";
import { buildAssetImportTemplate } from "@/lib/assets/excelTemplate";
import { requireApiSession } from "@/lib/auth/requireSession";

export function GET(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  return new NextResponse(new Uint8Array(buildAssetImportTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="asset-upload-template.xlsx"',
    },
  });
}
