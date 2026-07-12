import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";

// 런타임에 UI에서 바꿀 수 있는 앱 설정을 app_settings(key-value)에 보관한다.
// 지금은 "AI 분석 사용" 토글 하나뿐이지만, 다른 런타임 설정이 생기면 같은 테이블을 쓴다.
const AI_ANALYSIS_KEY = "ai_analysis_enabled";

function getSetting(key: string, db: Database): string | null {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string, db: Database): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = @value`,
  ).run({ key, value });
}

// 기본값은 OFF — 설정이 없으면(=아무도 켠 적 없으면) false.
export function getAiAnalysisEnabled(db: Database = getDb()): boolean {
  return getSetting(AI_ANALYSIS_KEY, db) === "true";
}

export function setAiAnalysisEnabled(enabled: boolean, db: Database = getDb()): void {
  setSetting(AI_ANALYSIS_KEY, enabled ? "true" : "false", db);
}
