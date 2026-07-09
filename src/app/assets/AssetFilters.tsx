"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Project } from "@/lib/projects/types";

const selectClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function AssetFilters({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/assets?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
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
