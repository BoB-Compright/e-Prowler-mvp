import { NextRequest, NextResponse } from "next/server";
import { getAsset } from "@/lib/assets/store";
import { deleteScheduleForAsset, getScheduleByAsset, upsertSchedule } from "@/lib/scheduling/store";
import type { ScheduleFrequency } from "@/lib/scheduling/types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface ValidScheduleInput {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  enabled: boolean;
}

function validateInput(body: unknown): ValidScheduleInput | { error: string } {
  const b = body as Record<string, unknown> | null;
  const frequency = b?.frequency;
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") {
    return { error: "frequency는 daily/weekly/monthly 중 하나여야 합니다" };
  }
  const timeOfDay = typeof b?.timeOfDay === "string" ? b.timeOfDay : "";
  if (!TIME_RE.test(timeOfDay)) {
    return { error: "timeOfDay는 'HH:mm' 형식이어야 합니다" };
  }

  let dayOfWeek: number | null = null;
  if (frequency === "weekly") {
    const value = b?.dayOfWeek;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) {
      return { error: "weekly 주기는 dayOfWeek(0~6)가 필요합니다" };
    }
    dayOfWeek = value;
  }

  let dayOfMonth: number | null = null;
  if (frequency === "monthly") {
    const value = b?.dayOfMonth;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31) {
      return { error: "monthly 주기는 dayOfMonth(1~31)가 필요합니다" };
    }
    dayOfMonth = value;
  }

  const enabled = b?.enabled !== false;
  return { frequency, dayOfWeek, dayOfMonth, timeOfDay, enabled };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "자산을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json({ schedule: getScheduleByAsset(id) ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "자산을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = validateInput(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const schedule = upsertSchedule(id, parsed);
  return NextResponse.json({ schedule });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteScheduleForAsset(id);
  return NextResponse.json({ ok: true });
}
