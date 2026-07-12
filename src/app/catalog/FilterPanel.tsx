import Link from "next/link";
import type { ModeFilter } from "@/lib/catalog/filter";
import { CATEGORY_LABELS, type Category } from "@/lib/catalog/types";
import { Card } from "../_components/Card";

const CATEGORIES: Category[] = ["container", "unix", "web"];
const MODE_OPTIONS: { value: ModeFilter; label: string }[] = [
  { value: "automated", label: "자동" },
  { value: "manual", label: "수동" },
];

function CheckboxMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        checked ? "border-primary bg-primary" : "border-border bg-surface"
      }`}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="white" strokeWidth="2">
          <path d="M3 7.5L6 10.5L12 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

// Builds a /catalog?... link that preserves the other active filters while
// changing just the one being clicked. Categories and frameworks are
// multi-select (toggle membership); mode is single-select-with-toggle-off
// (clicking the active one clears it back to "전체").
function buildHref(p: {
  categories: Category[];
  frameworks: string[];
  mode?: ModeFilter;
  query: string;
}): string {
  const s = new URLSearchParams();
  for (const c of p.categories) s.append("category", c);
  for (const f of p.frameworks) s.append("compliance", f);
  if (p.mode) s.set("mode", p.mode);
  if (p.query) s.set("q", p.query);
  const qs = s.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

export function FilterPanel({
  selectedCategories,
  selectedFrameworks,
  selectedMode,
  query,
  categoryCounts,
  frameworks,
}: {
  selectedCategories: Category[];
  selectedFrameworks: string[];
  selectedMode?: ModeFilter;
  query: string;
  categoryCounts: Record<Category, number>;
  frameworks: { id: string; name: string }[];
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
      <Card title="카테고리" bodyClassName="p-2">
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              href={buildHref({ categories: [], frameworks: selectedFrameworks, mode: selectedMode, query })}
              aria-pressed={selectedCategories.length === 0}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg"
            >
              <CheckboxMark checked={selectedCategories.length === 0} />
              <span className="flex-1">전체</span>
            </Link>
          </li>
          {CATEGORIES.map((category) => {
            const checked = selectedCategories.includes(category);
            const nextCategories = checked
              ? selectedCategories.filter((c) => c !== category)
              : [...selectedCategories, category];
            return (
              <li key={category}>
                <Link
                  href={buildHref({
                    categories: nextCategories,
                    frameworks: selectedFrameworks,
                    mode: selectedMode,
                    query,
                  })}
                  aria-pressed={checked}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg"
                >
                  <CheckboxMark checked={checked} />
                  <span className="flex-1">{CATEGORY_LABELS[category]}</span>
                  <span className="text-[12px] text-muted">{categoryCounts[category]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="컴플라이언스" bodyClassName="p-2">
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              href={buildHref({ categories: selectedCategories, frameworks: [], mode: selectedMode, query })}
              aria-pressed={selectedFrameworks.length === 0}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg"
            >
              <CheckboxMark checked={selectedFrameworks.length === 0} />
              <span className="flex-1">전체</span>
            </Link>
          </li>
          {frameworks.map((fw) => {
            const checked = selectedFrameworks.includes(fw.id);
            const next = checked
              ? selectedFrameworks.filter((x) => x !== fw.id)
              : [...selectedFrameworks, fw.id];
            return (
              <li key={fw.id}>
                <Link
                  href={buildHref({ categories: selectedCategories, frameworks: next, mode: selectedMode, query })}
                  aria-pressed={checked}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg"
                >
                  <CheckboxMark checked={checked} />
                  <span className="flex-1">{fw.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="점검 방식" bodyClassName="p-2">
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              href={buildHref({
                categories: selectedCategories,
                frameworks: selectedFrameworks,
                mode: undefined,
                query,
              })}
              aria-pressed={!selectedMode}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg"
            >
              <CheckboxMark checked={!selectedMode} />
              <span className="flex-1">전체</span>
            </Link>
          </li>
          {MODE_OPTIONS.map((option) => {
            const checked = selectedMode === option.value;
            return (
              <li key={option.value}>
                <Link
                  href={buildHref({
                    categories: selectedCategories,
                    frameworks: selectedFrameworks,
                    mode: checked ? undefined : option.value,
                    query,
                  })}
                  aria-pressed={checked}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-bg"
                >
                  <CheckboxMark checked={checked} />
                  <span className="flex-1">{option.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </aside>
  );
}
