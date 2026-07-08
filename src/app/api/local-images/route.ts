import { NextResponse } from "next/server";
import { listLocalImages } from "@/lib/pipeline/localImages";

export async function GET() {
  try {
    const images = await listLocalImages();
    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
