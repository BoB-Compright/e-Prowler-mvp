"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "../../_components/Card";

interface RegisteredInfo {
  projectId: string | null;
  projectName: string | null;
}

interface ExistingProject {
  id: string;
  name: string;
}

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";

// Mirrors the server-side repoName() derivation in
// /api/assets/import/create/route.ts so the default project name shown here
// matches what the API would fall back to.
function deriveRepoName(repoUrl: string): string {
  const last = repoUrl
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean)
    .pop();
  return last ?? "";
}

export function ImportForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [dockerfiles, setDockerfiles] = useState<string[] | null>(null);
  const [registered, setRegistered] = useState<Record<string, RegisteredInfo>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingProjects, setExistingProjects] = useState<ExistingProject[]>([]);

  async function handleDiscover(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDiscovering(true);
    try {
      const res = await fetch("/api/assets/import/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "발견에 실패했습니다");
        setDockerfiles(null);
        return;
      }
      const list: string[] = Array.isArray(data.dockerfiles) ? data.dockerfiles : [];
      const reg: Record<string, RegisteredInfo> =
        data.registered && typeof data.registered === "object" ? data.registered : {};
      setDockerfiles(list);
      setRegistered(reg);
      setExistingProjects([]);
      // 이미 등록된 경로는 다시 만들 수 없으므로 선택 대상에서 제외한다.
      setSelected(new Set(list.filter((p) => !reg[p])));
      setProjectName(deriveRepoName(repoUrl));
    } finally {
      setDiscovering(false);
    }
  }

  const selectable = (dockerfiles ?? []).filter((p) => !registered[p]);

  function toggleAll() {
    setSelected(selected.size === selectable.length ? new Set() : new Set(selectable));
  }

  function toggleOne(dfPath: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dfPath)) next.delete(dfPath);
      else next.add(dfPath);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setExistingProjects([]);
    setCreating(true);
    try {
      const res = await fetch("/api/assets/import/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, projectName, dockerfilePaths: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "가져오기에 실패했습니다");
        if (Array.isArray(data.existingProjects)) setExistingProjects(data.existingProjects);
        return;
      }
      router.push(`/projects/${data.projectId}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="1. 레포 발견">
        <form onSubmit={handleDiscover} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>레포 URL</span>
            <input
              name="repoUrl"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={discovering}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {discovering ? "발견 중..." : "발견"}
            </button>
          </div>
        </form>
      </Card>

      {error && (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-fail">{error}</p>
          {existingProjects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="text-[13px] font-semibold text-primary hover:underline"
            >
              기존 프로젝트로 이동: {p.name}
            </Link>
          ))}
        </div>
      )}

      {dockerfiles !== null && (
        <Card title="2. 이미지 선택 및 프로젝트 생성">
          {dockerfiles.length === 0 ? (
            <p className="text-[13px] text-muted italic">발견된 Dockerfile 없음</p>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className={labelClass}>Dockerfile ({selected.size}/{selectable.length} 선택)</span>
                {selectable.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="rounded-lg border border-primary px-3 py-1 text-[13px] font-semibold text-primary hover:bg-primary/5"
                  >
                    {selected.size === selectable.length ? "전체 해제" : "전체 선택"}
                  </button>
                )}
              </div>

              <ul className="flex flex-col gap-2 rounded-lg border border-border p-3">
                {dockerfiles.map((dfPath) => {
                  const reg = registered[dfPath];
                  return (
                    <li key={dfPath}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(dfPath)}
                          disabled={!!reg}
                          onChange={() => toggleOne(dfPath)}
                        />
                        <span className={`font-mono text-[13px] ${reg ? "text-muted" : ""}`}>
                          {dfPath}
                        </span>
                        {reg && (
                          <span className="text-[12px] text-muted">
                            이미 등록됨
                            {reg.projectId && (
                              <>
                                {" · "}
                                <Link
                                  href={`/projects/${reg.projectId}`}
                                  className="font-semibold text-primary hover:underline"
                                >
                                  {reg.projectName ?? "프로젝트 보기"}
                                </Link>
                              </>
                            )}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>

              {selectable.length === 0 ? (
                <p className="text-[13px] text-muted">
                  이 레포의 모든 이미지는 이미 등록되어 있습니다. 위의 프로젝트 링크로 이동해
                  기존 자산을 확인하세요.
                </p>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>프로젝트명</span>
                    <input
                      name="projectName"
                      required
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className={inputClass}
                    />
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={selected.size === 0 || creating}
                      className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {creating ? "가져오는 중..." : "가져오기"}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
