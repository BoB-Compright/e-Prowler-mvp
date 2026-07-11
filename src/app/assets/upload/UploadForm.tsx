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
function toRow(asset: Asset, projects: { id: string; name: string }[]): AssetRowData {
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

  // 이 화면에서 바로 프로젝트를 만들 수 있도록 로컬 목록/선택 상태로 관리한다.
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>(
    projects.map((p) => ({ id: p.id, name: p.name })),
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [np, setNp] = useState({ name: "", pmName: "", pmEmail: "" });
  const [projBusy, setProjBusy] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);

  async function handleCreateProject() {
    setProjError(null);
    if (!np.name.trim() || !np.pmName.trim() || !np.pmEmail.trim()) {
      setProjError("프로젝트명·PM 이름·PM 이메일을 입력하세요");
      return;
    }
    setProjBusy(true);
    try {
      // 공유 비밀번호는 자동 생성한다(프로젝트 설정의 공유 패널에서 언제든 재발급 가능).
      const sharePassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: np.name.trim(), pmName: np.pmName.trim(), pmEmail: np.pmEmail.trim(), sharePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProjError(data.error ?? "프로젝트 생성에 실패했습니다");
        return;
      }
      const created = data.project as { id: string; name: string };
      setProjectList((prev) => [...prev, { id: created.id, name: created.name }]);
      setSelectedProjectId(created.id);
      setShowCreate(false);
      setNp({ name: "", pmName: "", pmEmail: "" });
    } finally {
      setProjBusy(false);
    }
  }

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
        .map((a) => toRow(a, projectList));
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
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className={labelClass}>프로젝트 (선택)</span>
              <button
                type="button"
                onClick={() => setShowCreate((v) => !v)}
                className="text-[12.5px] font-semibold text-primary hover:underline"
              >
                {showCreate ? "닫기" : "+ 새 프로젝트"}
              </button>
            </div>
            <select
              name="projectId"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className={inputClass}
            >
              <option value="">미분류</option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            {showCreate && (
              <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-bg p-3">
                <p className="text-[12.5px] font-semibold">새 프로젝트 만들기</p>
                {/* name 속성 없이 제어 컴포넌트로 다뤄, 업로드 폼 데이터에 섞이지 않게 한다. */}
                {(
                  [
                    { key: "name", label: "프로젝트명" },
                    { key: "pmName", label: "PM 이름" },
                    { key: "pmEmail", label: "PM 이메일" },
                  ] as const
                ).map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-[12px] text-muted">{f.label}</span>
                    <input
                      type={f.key === "pmEmail" ? "email" : "text"}
                      value={np[f.key]}
                      onChange={(e) => setNp((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreateProject();
                        }
                      }}
                      className={inputClass}
                    />
                  </label>
                ))}
                <p className="text-[12px] text-muted">
                  공유 비밀번호는 자동 생성되며, 프로젝트 공유 설정에서 재발급할 수 있어요.
                </p>
                {projError && <p className="text-[12.5px] text-fail">{projError}</p>}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateProject}
                    disabled={projBusy}
                    className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {projBusy ? "만드는 중…" : "프로젝트 만들기"}
                  </button>
                </div>
              </div>
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>엑셀 파일</span>
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-primary file:bg-transparent file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-primary hover:file:bg-primary/5"
            />
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
          <AssetTable rows={importedRows} projects={projectList} />
        </Card>
      )}
    </div>
  );
}
