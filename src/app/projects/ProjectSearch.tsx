"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function ProjectSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);
  // Keep the local input in sync when the URL changes from elsewhere
  // (e.g. browser back/forward navigation). Adjusting state during render
  // (rather than in an effect) avoids an extra render pass.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/projects?${params.toString()}`);
  }

  // Debounce the search query so we don't push a navigation on every keystroke.
  useEffect(() => {
    if (query === urlQuery) return;
    const timeout = setTimeout(() => updateParam("q", query), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="project-search" className="text-[13px] font-medium">
        검색
      </label>
      <input
        id="project-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="프로젝트 이름으로 검색"
        className={`${inputClass} w-64`}
      />
    </div>
  );
}
