import { NextResponse } from "next/server";
import { getRun, listRunEvents } from "@/lib/pipeline/runs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  return NextResponse.json({ run, events: listRunEvents(id) });
}
