"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Project } from "@/lib/projects/types";
import { ASSET_CATEGORIES, CATEGORY_VENDORS, type AssetCategory } from "@/lib/assets/categories";
import { Card } from "../../_components/Card";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";

interface RegisteredInfo {
  projectId: string | null;
  projectName: string | null;
}

// 레포 URL에서 표시 이름을 유추한다(마지막 경로 세그먼트, .git 제거).
function deriveRepoName(repoUrl: string): string {
  const last = repoUrl.replace(/\.git$/, "").split("/").filter(Boolean).pop();
  return last ?? "repo";
}

export function AssetForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [type, setType] = useState<"repo" | "server">("repo");
  const [error, setError] = useState<string | null>(null);

  // 프로젝트: 이 화면에서 바로 만들 수 있도록 로컬 목록/선택 상태로 관리한다.
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>(
    projects.map((p) => ({ id: p.id, name: p.name })),
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [np, setNp] = useState({ name: "", pmName: "", pmEmail: "" });
  const [projBusy, setProjBusy] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);

  // 레포: URL 입력 → 발견(clone·Dockerfile 스캔) → 선택 → 등록.
  const [repoUrl, setRepoUrl] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [dockerfiles, setDockerfiles] = useState<string[] | null>(null);
  const [registered, setRegistered] = useState<Record<string, RegisteredInfo>>({});
  const [buildBlocked, setBuildBlocked] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  // 서버: 종류·제조사.
  const [category, setCategory] = useState<AssetCategory | "">("");
  const [vendor, setVendor] = useState("");
  const [customVendor, setCustomVendor] = useState("");

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

  async function handleDiscover() {
    setError(null);
    if (!repoUrl.trim()) {
      setError("레포 URL을 입력하세요");
      return;
    }
    setDiscovering(true);
    try {
      const res = await fetch("/api/assets/import/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
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
      const blocked: Record<string, string[]> =
        data.buildBlocked && typeof data.buildBlocked === "object" ? data.buildBlocked : {};
      setDockerfiles(list);
      setRegistered(reg);
      setBuildBlocked(blocked);
      // 이미 등록됐거나 빌드 불가한 Dockerfile은 기본 선택에서 제외한다.
      setSelected(new Set(list.filter((p) => !reg[p] && !blocked[p])));
    } finally {
      setDiscovering(false);
    }
  }

  const selectable = (dockerfiles ?? []).filter((p) => !registered[p] && !buildBlocked[p]);

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

  async function createRepoAsset(dockerfilePath: string | null): Promise<boolean> {
    const name = deriveRepoName(repoUrl);
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "repo",
        repoUrl: repoUrl.trim(),
        displayName: dockerfilePath ? `${name} / ${dockerfilePath}` : name,
        projectId: selectedProjectId || null,
        ...(dockerfilePath ? { dockerfilePath } : {}),
      }),
    });
    return res.ok;
  }

  async function handleRepoRegister(withoutDockerfile: boolean) {
    setError(null);
    setCreating(true);
    try {
      if (withoutDockerfile) {
        const ok = await createRepoAsset(null);
        if (!ok) {
          setError("등록에 실패했습니다");
          return;
        }
      } else {
        const paths = [...selected];
        const results = await Promise.all(paths.map((p) => createRepoAsset(p)));
        const created = results.filter(Boolean).length;
        if (created === 0) {
          setError("등록에 실패했습니다");
          return;
        }
      }
      router.push("/assets");
    } finally {
      setCreating(false);
    }
  }

  async function handleServerSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        type: "server",
        projectId: selectedProjectId || null,
        category: category || null,
        vendor: (vendor === "__custom__" ? customVendor.trim() : vendor) || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "등록에 실패했습니다");
      return;
    }
    router.push("/assets");
  }

  const projectSelector = (
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
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-lg border border-border bg-surface p-1">
          {(["repo", "server"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-md px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                type === t ? "bg-primary text-white" : "text-muted hover:bg-bg"
              }`}
            >
              {t === "repo" ? "레포" : "서버"}
            </button>
          ))}
        </div>
        <Link
          href="/assets/upload"
          className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
        >
          엑셀로 여러 개 등록
        </Link>
      </div>

      {type === "repo" ? (
        <>
          <Card title="레포 발견">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>레포 URL</span>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      setDockerfiles(null); // URL이 바뀌면 이전 발견 결과 무효화
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleDiscover();
                      }
                    }}
                    className={`min-w-0 flex-1 font-mono ${inputClass}`}
                    placeholder="https://github.com/org/repo"
                  />
                  <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={discovering}
                    className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {discovering ? "발견 중…" : "발견"}
                  </button>
                </div>
              </label>

              {projectSelector}

              {dockerfiles !== null && dockerfiles.length === 0 && (
                <div className="rounded-lg border border-border bg-bg p-3">
                  <p className="text-[13px] text-muted">
                    발견된 Dockerfile이 없습니다. Dockerfile 없이 레포만 등록할 수 있어요(점검 시 자동 감지 시도).
                  </p>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRepoRegister(true)}
                      disabled={creating}
                      className="rounded-lg border border-primary px-3 py-1.5 text-[13px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      {creating ? "등록 중…" : "Dockerfile 없이 등록"}
                    </button>
                  </div>
                </div>
              )}

              {dockerfiles !== null && dockerfiles.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className={labelClass}>
                      Dockerfile ({selected.size}/{selectable.length} 선택)
                    </span>
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
                      const blocked = buildBlocked[dfPath];
                      const disabled = !!reg || !!blocked;
                      return (
                        <li key={dfPath}>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected.has(dfPath)}
                              disabled={disabled}
                              onChange={() => toggleOne(dfPath)}
                            />
                            <span className={`font-mono text-[13px] ${disabled ? "text-muted" : ""}`}>{dfPath}</span>
                            {blocked ? (
                              <span className="text-[12px] text-fail">
                                빌드 불가 (인자 필요: {blocked.join(", ")})
                              </span>
                            ) : reg ? (
                              <span className="text-[12px] text-muted">
                                이미 등록됨
                                {reg.projectId && (
                                  <>
                                    {" · "}
                                    <Link href={`/projects/${reg.projectId}`} className="font-semibold text-primary hover:underline">
                                      {reg.projectName ?? "프로젝트 보기"}
                                    </Link>
                                  </>
                                )}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          {error && <p className="text-[13px] text-fail">{error}</p>}

          <div className="flex justify-end gap-3">
            <Link
              href="/assets"
              className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
            >
              취소
            </Link>
            {dockerfiles !== null && dockerfiles.length > 0 && (
              <button
                type="button"
                onClick={() => handleRepoRegister(false)}
                disabled={selected.size === 0 || creating}
                className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "등록 중…" : "선택 등록"}
              </button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={handleServerSubmit} className="flex flex-col gap-6">
          <Card title="기본 정보">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>이름</span>
                <input name="displayName" required className={inputClass} />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>호스트 IP</span>
                  <input name="hostIp" required className={`${inputClass} font-mono`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>호스트명</span>
                  <input name="hostname" required className={inputClass} />
                </label>
              </div>

              {projectSelector}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>OS (선택)</span>
                  <input name="os" className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>담당자 (선택)</span>
                  <input name="owner" className={inputClass} />
                </label>
              </div>
            </div>
          </Card>

          <Card title="자산 종류">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>종류 (선택)</span>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as AssetCategory | "");
                    setVendor("");
                    setCustomVendor("");
                  }}
                  className={inputClass}
                >
                  <option value="">선택 안 함</option>
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {category && (
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>제조사 (선택)</span>
                  <select value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputClass}>
                    <option value="">선택 안 함</option>
                    {CATEGORY_VENDORS[category].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                    <option value="__custom__">기타 (직접 입력)</option>
                  </select>
                </label>
              )}
              {category && vendor === "__custom__" && (
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={labelClass}>제조사 직접 입력</span>
                  <input
                    value={customVendor}
                    onChange={(e) => setCustomVendor(e.target.value)}
                    className={inputClass}
                    placeholder="제조사명"
                  />
                </label>
              )}
            </div>
          </Card>

          <Card title="SSH 자격 증명">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>SSH 포트</span>
                  <input name="sshPort" type="number" defaultValue={22} required className={`${inputClass} font-mono`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>인증 방식</span>
                  <select name="authType" className={inputClass}>
                    <option value="password">비밀번호</option>
                    <option value="key">SSH 키</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>사용자명</span>
                <input name="username" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>비밀번호 또는 SSH 키 내용</span>
                <textarea name="secret" required rows={4} className={`${inputClass} font-mono`} />
              </label>
            </div>
          </Card>

          {error && <p className="text-[13px] text-fail">{error}</p>}

          <div className="flex justify-end gap-3">
            <Link
              href="/assets"
              className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
            >
              취소
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              등록
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
