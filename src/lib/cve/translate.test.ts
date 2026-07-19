import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import {
  getCachedTranslations,
  translateCveSummaries,
  makeClaudeTranslate,
  parseBatchTranslationResponse,
  MAX_TRANSLATIONS_PER_CALL,
  type TranslateDeps,
} from "./translate";

let db: Database;
beforeEach(() => {
  db = createInMemoryDb();
});

function deps(over: Partial<TranslateDeps> = {}): TranslateDeps {
  return {
    aiEnabled: () => true,
    translate: vi.fn(async (items: { cveId: string; summary: string }[]) => new Map(items.map((i) => [i.cveId, `[KO] ${i.summary}`]))),
    ...over,
  };
}

describe("translateCveSummaries", () => {
  it("returns cache hits and translates only misses, persisting them", async () => {
    db.prepare(`INSERT INTO cve_translations (cve_id, summary_ko, translated_at) VALUES ('CVE-1','캐시된 번역','2026-07-13T00:00:00Z')`).run();
    const d = deps();
    const out = await translateCveSummaries(
      [{ cveId: "CVE-1", summary: "old" }, { cveId: "CVE-2", summary: "buffer overflow" }],
      d,
      db,
    );
    expect(out.get("CVE-1")).toBe("캐시된 번역"); // 캐시 그대로, 재번역 안 함
    expect(out.get("CVE-2")).toBe("[KO] buffer overflow");
    expect((d.translate as ReturnType<typeof vi.fn>).mock.calls[0][0].map((i: {cveId: string}) => i.cveId)).toEqual(["CVE-2"]);
    // 새 번역이 캐시에 저장됨
    expect(getCachedTranslations(["CVE-2"], db).get("CVE-2")).toBe("[KO] buffer overflow");
  });

  it("does not call the translator when AI is disabled — returns cache only", async () => {
    db.prepare(`INSERT INTO cve_translations (cve_id, summary_ko, translated_at) VALUES ('CVE-1','캐시','2026-07-13T00:00:00Z')`).run();
    const translate = vi.fn();
    const out = await translateCveSummaries(
      [{ cveId: "CVE-1", summary: "x" }, { cveId: "CVE-2", summary: "y" }],
      deps({ aiEnabled: () => false, translate }),
      db,
    );
    expect(translate).not.toHaveBeenCalled();
    expect(out.get("CVE-1")).toBe("캐시");
    expect(out.has("CVE-2")).toBe(false);
  });

  it("caps the number of misses translated per call at MAX_TRANSLATIONS_PER_CALL", async () => {
    const items = Array.from({ length: MAX_TRANSLATIONS_PER_CALL + 5 }, (_, i) => ({ cveId: `CVE-${i}`, summary: `s${i}` }));
    const translate = vi.fn(async (batch: {cveId: string; summary: string}[]) => new Map(batch.map((i) => [i.cveId, `k-${i.cveId}`])));
    await translateCveSummaries(items, deps({ translate }), db);
    expect(translate.mock.calls[0][0]).toHaveLength(MAX_TRANSLATIONS_PER_CALL);
  });
});

describe("parseBatchTranslationResponse (#80)", () => {
  it("parses a plain JSON object of cveId → korean", () => {
    const out = parseBatchTranslationResponse(
      '{"CVE-2026-1": "가 취약점", "CVE-2026-2": "나 취약점"}',
      ["CVE-2026-1", "CVE-2026-2"],
    );
    expect(out.get("CVE-2026-1")).toBe("가 취약점");
    expect(out.get("CVE-2026-2")).toBe("나 취약점");
  });

  it("parses JSON wrapped in a fenced code block with surrounding prose", () => {
    const text = '다음은 번역입니다.\n```json\n{"CVE-2026-1": "가"}\n```\n감사합니다.';
    const out = parseBatchTranslationResponse(text, ["CVE-2026-1"]);
    expect(out.get("CVE-2026-1")).toBe("가");
  });

  it("ignores unexpected ids, non-string and empty values", () => {
    const out = parseBatchTranslationResponse(
      '{"CVE-2026-1": "가", "CVE-9999-9": "몰라요", "CVE-2026-2": 42, "CVE-2026-3": "  "}',
      ["CVE-2026-1", "CVE-2026-2", "CVE-2026-3"],
    );
    expect([...out.keys()]).toEqual(["CVE-2026-1"]);
  });

  it("returns an empty map for unparseable output", () => {
    expect(parseBatchTranslationResponse("번역할 수 없습니다.", ["CVE-1"]).size).toBe(0);
  });
});

describe("makeClaudeTranslate (#80)", () => {
  const items = [
    { cveId: "CVE-2026-1", summary: "buffer overflow" },
    { cveId: "CVE-2026-2", summary: "sql injection" },
    { cveId: "CVE-2026-3", summary: "use after free" },
  ];

  it("translates all misses with a single batched API call", async () => {
    const call = vi.fn(async () => '{"CVE-2026-1": "가", "CVE-2026-2": "나", "CVE-2026-3": "다"}');
    const out = await makeClaudeTranslate(call)(items);
    expect(call).toHaveBeenCalledTimes(1);
    expect(out.get("CVE-2026-2")).toBe("나");
    expect(out.size).toBe(3);
  });

  it("falls back to per-item calls when the batch call fails, keeping partial success", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error("batch down")) // 배치 호출 실패
      .mockResolvedValueOnce("가") // CVE-2026-1
      .mockRejectedValueOnce(new Error("item down")) // CVE-2026-2 실패 — 건너뜀
      .mockResolvedValueOnce("다"); // CVE-2026-3
    const out = await makeClaudeTranslate(call)(items);
    expect(call).toHaveBeenCalledTimes(4);
    expect(out.get("CVE-2026-1")).toBe("가");
    expect(out.has("CVE-2026-2")).toBe(false);
    expect(out.get("CVE-2026-3")).toBe("다");
  });

  it("falls back to per-item calls when the batch response is unparseable", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce("죄송하지만 JSON이 아닙니다") // 배치 응답 파싱 불가
      .mockResolvedValueOnce("가")
      .mockResolvedValueOnce("나")
      .mockResolvedValueOnce("다");
    const out = await makeClaudeTranslate(call)(items);
    expect(call).toHaveBeenCalledTimes(4);
    expect(out.size).toBe(3);
  });

  it("does not call the API at all for an empty miss list", async () => {
    const call = vi.fn();
    const out = await makeClaudeTranslate(call)([]);
    expect(call).not.toHaveBeenCalled();
    expect(out.size).toBe(0);
  });
});
