import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { listLocalImages } from "@/lib/pipeline/localImages";

export async function GET(req: Request) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

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
