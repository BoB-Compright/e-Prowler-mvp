"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LocalImage {
  tag: string;
  id: string;
  size: string;
  createdSince: string;
}

type SourceMode = "git" | "local_image";

export function StartRunForm() {
  const router = useRouter();
  const [mode, setMode] = useState<SourceMode>("git");
  const [repoUrl, setRepoUrl] = useState("");
  const [imageTag, setImageTag] = useState("");
  const [localImages, setLocalImages] = useState<LocalImage[] | null>(null);
  const [localImagesError, setLocalImagesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Local images are only needed once the user opens that tab — Dockerfile
  // clone/build issues are the common case, so don't shell out to `docker
  // images` on every page load.
  useEffect(() => {
    if (mode !== "local_image" || localImages !== null) return;
    fetch("/api/local-images")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setLocalImagesError(data.error);
          return;
        }
        setLocalImages(data.images);
      })
      .catch(() => setLocalImagesError("로컬 이미지 목록을 불러올 수 없습니다"));
  }, [mode, localImages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "git" ? { repoUrl } : { imageTag }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "점검을 시작하지 못했습니다");
        return;
      }
      router.push(`/runs/${data.run.id}`);
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-1.5">
      <div className="flex w-fit gap-1 rounded-[var(--radius-nh)] border border-[var(--color-border)] p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("git")}
          className={`rounded-[var(--radius-nh)] px-4 py-1.5 ${mode === "git" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted)]"}`}
        >
          Git 레포
        </button>
        <button
          type="button"
          onClick={() => setMode("local_image")}
          className={`rounded-[var(--radius-nh)] px-4 py-1.5 ${mode === "local_image" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted)]"}`}
        >
          로컬 이미지 (Fallback)
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
        {mode === "git" ? (
          <input
            type="text"
            required
            spellCheck={false}
            placeholder="https://github.com/owner/repo.git"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="flex-1 rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 font-mono text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          />
        ) : (
          <select
            required
            value={imageTag}
            onChange={(e) => setImageTag(e.target.value)}
            disabled={!localImages || localImages.length === 0}
            className="flex-1 rounded-[var(--radius-nh)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
          >
            <option value="" disabled>
              {localImagesError
                ? "로컬 이미지 목록을 불러올 수 없습니다"
                : localImages === null
                  ? "불러오는 중…"
                  : localImages.length === 0
                    ? "로컬에 존재하는 이미지가 없습니다"
                    : "이미지 선택"}
            </option>
            {localImages?.map((image) => (
              <option key={image.id} value={image.tag}>
                {image.tag} ({image.size}, {image.createdSince})
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={submitting || (mode === "local_image" && !imageTag)}
          className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "시작 중…" : "점검 시작"}
        </button>
      </form>
      {mode === "local_image" && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          GitHub clone 또는 Docker Build가 실패할 때, 이미 빌드된 로컬 이미지로 Sandbox 실행부터 재개합니다.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-[var(--color-fail)]">{error}</p>}
    </div>
  );
}
