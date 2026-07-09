"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Project } from "@/lib/projects/types";

const selectClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function AssetFilters({ projects }: { projects: Project[] }) {
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
    router.push(`/assets?${params.toString()}`);
  }

  // Debounce the search query so we don't push a navigation on every keystroke.
  useEffect(() => {
    if (query === urlQuery) return;
    const timeout = setTimeout(() => updateParam("q", query), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="asset-search" className="text-[13px] font-medium">
          검색
        </label>
        <input
          id="asset-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름, 레포 URL, 호스트 IP로 검색"
          className={`${selectClass} w-64`}
        />
      </div>
      <select
        value={searchParams.get("projectId") ?? ""}
        onChange={(e) => updateParam("projectId", e.target.value)}
        className={selectClass}
      >
        <option value="">전체 프로젝트</option>
        <option value="unassigned">미분류</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("type") ?? ""}
        onChange={(e) => updateParam("type", e.target.value)}
        className={selectClass}
      >
        <option value="">전체 타입</option>
        <option value="repo">레포</option>
        <option value="server">서버</option>
      </select>
    </div>
  );
}
