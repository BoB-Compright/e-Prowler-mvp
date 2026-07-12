import { getCatalogByCategory, getCatalogSummary, getFrameworks } from "@/lib/catalog";
import {
  filterCatalog,
  parseCategoryParam,
  parseComplianceParam,
  parseModeParam,
} from "@/lib/catalog/filter";
import { CATEGORY_LABELS, type Category, type Severity } from "@/lib/catalog/types";
import { Card } from "../_components/Card";
import { SectionLabel } from "../_components/SectionLabel";
import { StatusBadge } from "../_components/StatusBadge";
import type { BadgeStatus } from "../_components/statusBadgeStyles";
import { CatalogSearch } from "./CatalogSearch";
import { FilterPanel } from "./FilterPanel";

const CATEGORIES: Category[] = ["container", "unix", "web"];

// severity 매핑 관례: critical/high→fail, medium→review, low→neutral.
const SEVERITY_BADGE: Record<Severity, BadgeStatus> = {
  Critical: "fail",
  High: "fail",
  Medium: "review",
  Low: "neutral",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    compliance?: string | string[];
    mode?: string | string[];
    q?: string;
  }>;
}) {
  const { category, compliance, mode: modeParam, q } = await searchParams;
  const selectedCategories = parseCategoryParam(category);
  const selectedFrameworks = parseComplianceParam(compliance);
  const selectedMode = parseModeParam(modeParam);
  const query = q ?? "";

  const summary = getCatalogSummary();
  const frameworks = getFrameworks();

  const visibleCategories =
    selectedCategories.length > 0 ? CATEGORIES.filter((c) => selectedCategories.includes(c)) : CATEGORIES;

  const filteredByCategory = new Map<Category, ReturnType<typeof filterCatalog>>();
  const categoryCounts = {} as Record<Category, number>;
  let totalMatched = 0;
  for (const category of CATEGORIES) {
    const items = filterCatalog(getCatalogByCategory(category), {
      frameworks: selectedFrameworks,
      mode: selectedMode,
      query,
    });
    filteredByCategory.set(category, items);
    categoryCounts[category] = items.length;
    if (visibleCategories.includes(category)) totalMatched += items.length;
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">보안 점검 카탈로그</h1>
        <p className="mt-1 text-[13px] text-muted">
          컨테이너/이미지 하드닝, KISA 가이드 기반 Unix·웹서비스 점검 항목 총{" "}
          {summary.total}개 (자동화 {summary.automated} · 자동화 전 {summary.notAutomated})
        </p>
        <p className="mt-1 text-[13px] text-muted">
          기준 프레임워크:{" "}
          {frameworks
            .map((framework) => `${framework.name} (${summary.byFramework[framework.id]}개)`)
            .join(", ")}
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-6 lg:flex-row">
        <FilterPanel
          selectedCategories={selectedCategories}
          selectedFrameworks={selectedFrameworks}
          selectedMode={selectedMode}
          query={query}
          categoryCounts={categoryCounts}
          frameworks={frameworks}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <CatalogSearch />
            <p className="text-[13px] text-muted">
              필터 결과 <span className="font-semibold text-text">{totalMatched}</span>건
            </p>
          </div>

          <Card bodyClassName="p-0">
            {visibleCategories.map((category, index) => {
              const items = filteredByCategory.get(category) ?? [];
              return (
                <div key={category} className={index > 0 ? "border-t border-border" : ""}>
                  <div className="flex items-center gap-2 border-b border-border bg-bg px-5 py-3">
                    <SectionLabel>{CATEGORY_LABELS[category]}</SectionLabel>
                    <span className="text-[13px] text-muted">({items.length}개)</span>
                  </div>
                  {items.length === 0 ? (
                    <p className="p-5 text-[13px] text-muted italic">
                      조건에 맞는 점검 항목이 없습니다.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-5 py-3">
                              <SectionLabel>ID</SectionLabel>
                            </th>
                            <th className="px-5 py-3">
                              <SectionLabel>항목</SectionLabel>
                            </th>
                            <th className="px-5 py-3">
                              <SectionLabel>프레임워크</SectionLabel>
                            </th>
                            <th className="px-5 py-3">
                              <SectionLabel>심각도</SectionLabel>
                            </th>
                            <th className="px-5 py-3">
                              <SectionLabel>자동화 상태</SectionLabel>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {items.map((item) => (
                            <tr key={item.id} className="hover:bg-bg">
                              <td className="px-5 py-3 font-mono text-[13px]">{item.id}</td>
                              <td className="px-5 py-3">{item.title}</td>
                              <td className="px-5 py-3 text-muted">
                                {item.source.framework} ·{" "}
                                <span className="font-mono text-[12px]">{item.source.ref}</span>
                              </td>
                              <td className="px-5 py-3">
                                <StatusBadge status={SEVERITY_BADGE[item.severity]}>
                                  {item.severity}
                                </StatusBadge>
                              </td>
                              <td className="px-5 py-3 text-muted">
                                {item.automationStatus === "automated" ? "자동화" : "자동화 전"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </main>
  );
}
