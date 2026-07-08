"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/projects/types";

const inputClass = "rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
      <div className="flex gap-2">
        {(["repo", "server"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`rounded-[var(--radius-nh)] border px-3 py-1.5 ${type === t ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
            {t === "repo" ? "레포" : "서버"}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">이름<input name="displayName" required className={inputClass} /></label>

      {type === "repo" ? (
        <label className="flex flex-col gap-1">레포 URL<input name="repoUrl" required className={inputClass} /></label>
      ) : (
        <>
          <label className="flex flex-col gap-1">호스트 IP<input name="hostIp" required className={inputClass} /></label>
          <label className="flex flex-col gap-1">호스트명<input name="hostname" required className={inputClass} /></label>
          <label className="flex flex-col gap-1">SSH 포트<input name="sshPort" type="number" defaultValue={22} required className={inputClass} /></label>
          <label className="flex flex-col gap-1">인증 방식
            <select name="authType" className={inputClass}>
              <option value="password">비밀번호</option>
              <option value="key">SSH 키</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">사용자명<input name="username" required className={inputClass} /></label>
          <label className="flex flex-col gap-1">비밀번호 또는 SSH 키 내용<textarea name="secret" required className={inputClass} /></label>
        </>
      )}

      <label className="flex flex-col gap-1">프로젝트 (선택)
        <select name="projectId" className={inputClass}>
          <option value="">미분류</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>

      {error && <p className="text-[var(--color-fail)]">{error}</p>}
      <button type="submit" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white">등록</button>
    </form>
  );
}
