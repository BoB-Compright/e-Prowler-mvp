import type { ScheduleFrequency } from "./nextRun";

export type { ScheduleFrequency };

export interface Schedule {
  id: string;
  assetId: string;
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastSkipReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleInput {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  enabled: boolean;
}
