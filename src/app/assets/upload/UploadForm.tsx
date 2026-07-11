"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects/types";
import type { Asset } from "@/lib/assets/types";
import type { ImportRowResult } from "@/lib/assets/excelImport";
import { Card } from "../../_components/Card";
import { AssetTable, type AssetRowData } from "../AssetTable";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";

type UploadResult = { repo: ImportRowResult[]; server: ImportRowResult[] };

// 갓 업로드된 자산은 아직 점검 이력·스케줄이 없으므로 상태는 "미점검", 정기 점검은
// "—"로 고정된다(서버 조회 없이 결정 가능).
function toRow(asset: Asset, projects: Project[]): AssetRowData {
  const project = projects.find((p) => p.id === asset.projectId);
  return {
    id: asset.id,
    displayName: asset.displayName,
    detail: asset.type === "repo" ? (asset.repoUrl ?? "") : `${asset.hostIp}:${asset.sshPort}`,
    typeLabel: asset.type === "repo" ? "레포" : "서버",
    projectName: project?.name ?? "미분류",
    createdAt: asset.createdAt,
    scheduleLabel: "—",
    badgeStatus: "neutral",
    badgeLabel: "미점검",
  };
}

export function UploadForm({ projects }: { projects: Project[] }) {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [importedRows, setImportedRows] = useState<AssetRowData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/assets/upload", { method: "POST", body: new FormData(e.currentTarget) });
      const data: UploadResult | null = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError((data as { error?: string } | null)?.error ?? "업로드에 실패했습니다");
        return;
      }
      setResult(data);

      // 성공적으로 등록된 자산 id를 모아, 방금 만든 자산만 골라 체크박스 일괄 UI로 보여준다.
      const importedIds = new Set(
        [...data.repo, ...data.server].filter((r): r is Extract<ImportRowResult, { ok: true }> => r.ok).map((r) => r.assetId),
      );
      if (importedIds.size === 0) {
        setImportedRows([]);
        return;
      }
      const listRes = await fetch("/api/assets");
      const listData: { assets?: Asset[] } | null = await listRes.json().catch(() => null);
      const rows = (listData?.assets ?? [])
        .filter((a) => importedIds.has(a.id))
        .map((a) => toRow(a, projects));
      setImportedRows(rows);
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
                {result[key].length === 0 ? (
                  <p className="text-[13px] text-muted italic">해당 시트 없음</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {result[key].map((row) => (
                      <li key={row.row} className={row.ok ? "text-pass" : "text-fail"}>
                        {row.row}행: {row.ok ? "성공" : row.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {importedRows.length > 0 && (
        <Card title={`등록된 자산 (${importedRows.length})`}>
          {/* 방금 업로드한 자산을 체크박스로 선택해 바로 일괄 점검·프로젝트 이동·정기 점검
              설정·삭제하거나, 이름을 눌러 상세로 이동할 수 있다(자산 관리 목록과 동일 UI). */}
          <AssetTable rows={importedRows} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </Card>
      )}
    </div>
  );
}
