"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Project } from "@/lib/projects/types";
import { Card } from "../../_components/Card";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";

export function AssetForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [type, setType] = useState<"repo" | "server">("repo");
  const [error, setError] = useState<string | null>(null);

  // 자산 등록 화면에서 바로 프로젝트를 만들 수 있도록 로컬 목록/선택 상태를 관리한다.
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
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, type }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "등록에 실패했습니다");
      return;
    }
    router.push("/assets");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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

      <Card title="기본 정보">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>이름</span>
            <input name="displayName" required className={inputClass} />
          </label>

          {type === "repo" ? (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>레포 URL</span>
              <input name="repoUrl" required className={`${inputClass} font-mono`} />
            </label>
          ) : (
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
          )}

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
                {/* name 속성 없이 제어 컴포넌트로 다뤄, 자산 등록 폼 데이터에 섞이지 않게 한다.
                    Enter는 폼 제출 대신 프로젝트 생성으로 연결한다. */}
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

      {type === "server" && (
        <Card title="SSH 자격 증명">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>SSH 포트</span>
                <input
                  name="sshPort"
                  type="number"
                  defaultValue={22}
                  required
                  className={`${inputClass} font-mono`}
                />
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
      )}

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
  );
}
