import { NextResponse } from "next/server";
import { buildAssetImportTemplate } from "@/lib/assets/excelTemplate";

export function GET() {
  return new NextResponse(new Uint8Array(buildAssetImportTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="asset-upload-template.xlsx"',
    },
  });
}
