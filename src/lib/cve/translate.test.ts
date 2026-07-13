import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/db";
import { getCachedTranslations, translateCveSummaries, MAX_TRANSLATIONS_PER_CALL, type TranslateDeps } from "./translate";

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
