"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects/types";
import type { ImportRowResult } from "@/lib/assets/excelImport";
import { Card } from "../../_components/Card";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";

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
    <div className="flex flex-col gap-6">
      <Card title="기본 정보">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>프로젝트 (선택)</span>
            <select name="projectId" className={inputClass}>
              <option value="">미분류</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>엑셀 파일</span>
            <input type="file" name="file" accept=".xlsx" required className="text-sm" />
          </label>

          {error && <p className="text-[13px] text-fail">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "업로드 중…" : "업로드"}
            </button>
          </div>
        </form>
      </Card>

      {result && (
        <Card title="업로드 결과">
          <div className="flex flex-col gap-4">
            {(["repo", "server"] as const).map((key) => (
              <div key={key}>
                <p className="mb-2 text-[13px] font-bold">{key === "repo" ? "레포" : "서버"} 결과</p>
                <ul className="flex flex-col gap-1 text-[13px]">
                  {result[key].map((row) => (
                    <li key={row.row} className={row.ok ? "text-pass" : "text-fail"}>
                      {row.row}행: {row.ok ? "성공" : row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
