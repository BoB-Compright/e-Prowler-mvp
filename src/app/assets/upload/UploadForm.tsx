"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects/types";
import type { ImportRowResult } from "@/lib/assets/excelImport";

export function UploadForm({ projects }: { projects: Project[] }) {
  const [result, setResult] = useState<{ repo: ImportRowResult[]; server: ImportRowResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/assets/upload", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "업로드에 실패했습니다");
        return;
      }
      setResult(data);
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <select name="projectId" className="rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1">
          <option value="">미분류</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <input type="file" name="file" accept=".xlsx" required />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white disabled:opacity-50"
        >
          {submitting ? "업로드 중…" : "업로드"}
        </button>
      </form>

      {error && <p className="text-[var(--color-fail)]">{error}</p>}

      {result && (
        <div className="flex flex-col gap-2">
          {(["repo", "server"] as const).map((key) => (
            <div key={key}>
              <p className="font-bold">{key === "repo" ? "레포" : "서버"} 결과</p>
              <ul>
                {result[key].map((row) => (
                  <li key={row.row} className={row.ok ? "text-[var(--color-pass)]" : "text-[var(--color-fail)]"}>
                    {row.row}행: {row.ok ? "성공" : row.reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
