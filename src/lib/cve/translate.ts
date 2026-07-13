import type { Database } from "better-sqlite3";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db";
import { getAiAnalysisEnabled } from "@/lib/settings/store";
import { sanitizeForClaude } from "@/lib/claude/sanitize";

export const MAX_TRANSLATIONS_PER_CALL = 30;

export function getCachedTranslations(cveIds: string[], db: Database = getDb()): Map<string, string> {
  const out = new Map<string, string>();
  if (cveIds.length === 0) return out;
  const placeholders = cveIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT cve_id, summary_ko FROM cve_translations WHERE cve_id IN (${placeholders})`)
    .all(...cveIds) as { cve_id: string; summary_ko: string }[];
  for (const r of rows) out.set(r.cve_id, r.summary_ko);
  return out;
}

function saveTranslation(cveId: string, ko: string, db: Database): void {
  db.prepare(
    `INSERT INTO cve_translations (cve_id, summary_ko, translated_at) VALUES (@cveId, @ko, @at)
     ON CONFLICT(cve_id) DO UPDATE SET summary_ko = @ko, translated_at = @at`,
  ).run({ cveId, ko, at: new Date().toISOString() });
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// 실제 Claude(haiku) 번역: 항목마다 한 문장 한국어로. 실패한 항목은 결과에서 빠진다.
async function claudeTranslate(items: { cveId: string; summary: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const item of items) {
    try {
      const res = await getClient().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: "다음 CVE 영문 요약을 한국어 한 문장으로 간결히 번역하세요. 설명 없이 번역문만 출력합니다.",
        messages: [{ role: "user", content: sanitizeForClaude(item.summary) }],
      });
      const text = res.content.find((b) => b.type === "text");
      if (text && "text" in text && text.text.trim()) out.set(item.cveId, text.text.trim());
    } catch {
      // 이 항목만 건너뛴다(부분 성공 허용) — 화면은 영문 폴백.
    }
  }
  return out;
}

export interface TranslateDeps {
  translate: (items: { cveId: string; summary: string }[]) => Promise<Map<string, string>>;
  aiEnabled: () => boolean;
}

const defaultDeps: TranslateDeps = {
  translate: claudeTranslate,
  aiEnabled: () => getAiAnalysisEnabled() || process.env.CLAUDE_ANALYSIS_ENABLED === "true",
};

// 캐시된 번역 + (AI ON일 때만) 캐시 미스 번역·저장. 호출당 미스 상한 30.
export async function translateCveSummaries(
  items: { cveId: string; summary: string }[],
  deps: TranslateDeps = defaultDeps,
  db: Database = getDb(),
): Promise<Map<string, string>> {
  const ids = items.map((i) => i.cveId);
  const cached = getCachedTranslations(ids, db);
  if (!deps.aiEnabled()) return cached;

  const misses = items.filter((i) => !cached.has(i.cveId)).slice(0, MAX_TRANSLATIONS_PER_CALL);
  if (misses.length === 0) return cached;

  const fresh = await deps.translate(misses);
  for (const [cveId, ko] of fresh) {
    saveTranslation(cveId, ko, db);
    cached.set(cveId, ko);
  }
  return cached;
}
