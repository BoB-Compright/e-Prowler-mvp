import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { getAiAnalysisEnabled, setAiAnalysisEnabled } from "./store";

let db: Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe("ai analysis setting", () => {
  it("defaults to false when never set", () => {
    expect(getAiAnalysisEnabled(db)).toBe(false);
  });

  it("persists true then false (upsert, no duplicate rows)", () => {
    setAiAnalysisEnabled(true, db);
    expect(getAiAnalysisEnabled(db)).toBe(true);

    setAiAnalysisEnabled(false, db);
    expect(getAiAnalysisEnabled(db)).toBe(false);

    const count = (db.prepare(`SELECT COUNT(*) as c FROM app_settings`).get() as { c: number }).c;
    expect(count).toBe(1);
  });
});
