"use client";

import { useState } from "react";

// 점검 시 Claude AI 분석을 켜고 끄는 런타임 토글. 서버 컴포넌트에서 초기 상태를
// 받아 즉시 렌더하고, 변경 시 PUT /api/settings/ai-analysis로 서버 설정을 바꾼다.
// 기본은 OFF(토큰 절약) — 켠 뒤 실행하는 점검부터 AI 판정·근거가 채워진다.
export function AiAnalysisToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/ai-analysis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setError("변경 실패");
        return;
      }
      setEnabled(next);
    } catch {
      setError("서버 연결 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
      <div className="flex flex-col">
        <span className="text-[13px] font-semibold">AI 분석 (Claude)</span>
        <span className="text-[11px] text-muted">
          {enabled ? "켜짐 — 점검 시 AI 판정·근거 생성 (토큰 사용)" : "꺼짐 — 규칙 기반만"}
        </span>
      </div>
      {/* 표준 토글: 트랙은 inline-flex + 좌우 패딩(px-0.5), 손잡이는 translate-x-0/5로만
          이동한다(트랙 내부폭 40px = 손잡이 20px + 이동 20px). 손잡이가 pill 밖으로
          삐져나오지 않도록 absolute/hand-tuned translate 대신 flow 안에서 배치한다. */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="AI 분석 토글"
        disabled={busy}
        onClick={toggle}
        className={`inline-flex h-6 w-11 flex-none items-center rounded-full px-0.5 transition-colors disabled:opacity-50 ${
          enabled ? "bg-primary" : "bg-neutral/40"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      {error && <span className="text-[11px] text-fail">{error}</span>}
    </div>
  );
}
