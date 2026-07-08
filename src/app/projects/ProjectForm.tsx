"use client";

import { useRouter } from "next/navigation";

const inputClass = "rounded-[var(--radius-nh)] border border-[var(--color-border)] px-2 py-1";

export function ProjectForm() {
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 text-sm">
      <input name="name" placeholder="프로젝트명" required className={inputClass} />
      <input name="pmName" placeholder="PM 이름" required className={inputClass} />
      <input name="pmEmail" type="email" placeholder="PM 이메일" required className={inputClass} />
      <input name="sharePassword" placeholder="공유링크 비밀번호" required className={inputClass} />
      <button type="submit" className="rounded-[var(--radius-nh)] bg-[var(--color-primary)] px-3 py-1.5 text-white">프로젝트 생성</button>
    </form>
  );
}
