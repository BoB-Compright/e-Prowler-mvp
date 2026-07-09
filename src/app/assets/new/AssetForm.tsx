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
