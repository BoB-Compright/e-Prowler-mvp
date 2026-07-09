"use client";

import { useState } from "react";
import { Card } from "../_components/Card";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("아이디 또는 비밀번호가 올바르지 않습니다");
        return;
      }
      // Full reload so the root layout re-runs its server-side session check
      // and picks up the new cookie immediately.
      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm" bodyClassName="p-6">
        <h1 className="mb-1 text-[20px] font-bold tracking-[-0.02em]">로그인</h1>
        <p className="mb-4 text-[13px] text-muted">e-Prowler 계정으로 로그인하세요.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="login-username" className="mb-1 block text-[13px] font-medium">
              아이디
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              disabled={submitting}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-[13px] font-medium">
              비밀번호
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-[13px] text-fail">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </Card>
    </div>
  );
}
