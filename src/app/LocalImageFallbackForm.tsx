"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "./_components/Card";

interface LocalImage {
  tag: string;
  id: string;
  size: string;
  createdSince: string;
}

export function LocalImageFallbackForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [imageTag, setImageTag] = useState("");
  const [localImages, setLocalImages] = useState<LocalImage[] | null>(null);
  const [localImagesError, setLocalImagesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Docker 이미지 목록 조회는 섹션을 펼쳤을 때만 (docker CLI shell-out 비용)
  useEffect(() => {
    if (!open || localImages !== null) return;
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
  }, [open, localImages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageTag }),
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
    <Card
      title={
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 text-left hover:text-primary"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          로컬 이미지 재점검 (Fallback)
        </button>
      }
      bodyClassName={open ? "p-5" : "hidden"}
    >
      {open && (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="local-image-tag" className="mb-1 block text-[13px] font-medium">
                이미지 선택
              </label>
              <select
                id="local-image-tag"
                required
                value={imageTag}
                onChange={(e) => setImageTag(e.target.value)}
                disabled={!localImages || localImages.length === 0}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
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
                  <option key={image.tag} value={image.tag}>
                    {image.tag} ({image.size}, {image.createdSince})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting || !imageTag}
              className="h-fit self-end rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "시작 중…" : "점검 시작"}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">
            GitHub clone 또는 Docker Build가 실패할 때, 이미 빌드된 로컬 이미지로 Sandbox 실행부터 재개합니다.
          </p>
          {error && <p className="mt-2 text-sm text-fail">{error}</p>}
        </>
      )}
    </Card>
  );
}
