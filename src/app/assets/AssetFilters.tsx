"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Project } from "@/lib/projects/types";

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
    <div className="mb-4 flex gap-3 text-sm">
      <select value={searchParams.get("projectId") ?? ""} onChange={(e) => updateParam("projectId", e.target.value)}
        className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1">
        <option value="">전체 프로젝트</option>
        <option value="unassigned">미분류</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <select value={searchParams.get("type") ?? ""} onChange={(e) => updateParam("type", e.target.value)}
        className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1">
        <option value="">전체 타입</option>
        <option value="repo">레포</option>
        <option value="server">서버</option>
      </select>
    </div>
  );
}
