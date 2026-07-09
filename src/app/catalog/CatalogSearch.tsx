"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// Debounced text search bound to ?q=, mirroring the pattern in
// src/app/assets/AssetFilters.tsx: local state for responsive typing, a
// render-phase sync so external URL changes (back/forward) still take
// effect, and a ref to tell those apart from our own debounced push.
export function CatalogSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  const pushedQueryRef = useRef<string | null>(null);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    // eslint-disable-next-line react-hooks/refs
    if (urlQuery !== pushedQueryRef.current) setQuery(urlQuery);
  }

  useEffect(() => {
    if (query === urlQuery) return;
    const timeout = setTimeout(() => {
      pushedQueryRef.current = query;
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      router.replace(`/catalog?${params.toString()}`);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="catalog-search" className="text-[13px] font-medium">
        검색
      </label>
      <input
        id="catalog-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="항목 코드(U-xx/W-xx/C-xx) 또는 제목으로 검색"
        className={`${inputClass} w-72`}
      />
    </div>
  );
}
