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

// Claude 호출을 좁은 함수로 추상화(system+user → 텍스트)해서 배치/폴백 로직을
// SDK 없이 테스트할 수 있게 한다.
type ClaudeCall = (system: string, user: string, maxTokens: number) => Promise<string>;

const sdkCall: ClaudeCall = async (system, user, maxTokens) => {
  const res = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content.find((b) => b.type === "text");
  return text && "text" in text ? text.text : "";
};

// 배치 응답에서 {cveId: 번역문} JSON을 견고하게 파싱한다. 코드펜스·앞뒤 잡음을
// 허용하고, 요청하지 않은 id·비문자열·빈 값은 무시한다. 파싱 불가면 빈 Map.
export function parseBatchTranslationResponse(text: string, expectedIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return out;
  const expected = new Set(expectedIds);
  for (const [id, value] of Object.entries(parsed)) {
    if (expected.has(id) && typeof value === "string" && value.trim()) out.set(id, value.trim());
  }
  return out;
}

const BATCH_SYSTEM =
  "다음 CVE 영문 요약 목록을 각각 한국어 한 문장으로 간결히 번역하세요. " +
  '응답은 설명 없이 {"CVE-ID": "번역문"} 형태의 JSON 객체만 출력합니다.';
const ITEM_SYSTEM = "다음 CVE 영문 요약을 한국어 한 문장으로 간결히 번역하세요. 설명 없이 번역문만 출력합니다.";

// 실제 Claude(haiku) 번역. 캐시 미스 전체(≤30건)를 한 번의 배치 호출로 번역하고,
// 배치 실패·파싱 불가 시에만 기존 항목별 순차 번역으로 폴백한다(부분 성공 허용) (#80).
export function makeClaudeTranslate(call: ClaudeCall): (items: { cveId: string; summary: string }[]) => Promise<Map<string, string>> {
  return async (items) => {
    if (items.length === 0) return new Map();

    try {
      const payload = JSON.stringify(
        items.map((i) => ({ cveId: i.cveId, summary: sanitizeForClaude(i.summary) })),
      );
      const text = await call(BATCH_SYSTEM, payload, 150 * items.length);
      const batch = parseBatchTranslationResponse(text, items.map((i) => i.cveId));
      if (batch.size > 0) return batch;
    } catch {
      // 배치 실패 — 아래 항목별 폴백으로.
    }

    const out = new Map<string, string>();
    for (const item of items) {
      try {
        const text = await call(ITEM_SYSTEM, sanitizeForClaude(item.summary), 300);
        if (text.trim()) out.set(item.cveId, text.trim());
      } catch {
        // 이 항목만 건너뛴다(부분 성공 허용) — 화면은 영문 폴백.
      }
    }
    return out;
  };
}

const claudeTranslate = makeClaudeTranslate(sdkCall);

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
