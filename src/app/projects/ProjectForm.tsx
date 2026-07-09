"use client";

import { useRouter } from "next/navigation";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[13px] font-medium";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>프로젝트명</span>
          <input name="name" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>PM 이름</span>
          <input name="pmName" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>PM 이메일</span>
          <input name="pmEmail" type="email" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>공유링크 비밀번호</span>
          <input name="sharePassword" required className={inputClass} />
        </label>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          프로젝트 생성
        </button>
      </div>
    </form>
  );
}
