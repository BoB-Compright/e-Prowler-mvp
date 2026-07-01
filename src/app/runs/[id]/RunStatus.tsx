"use client";

import { useEffect, useState } from "react";
import type { Run, RunEvent } from "@/lib/pipeline/types";
import { CHECK_STATUS_LABELS, type CheckStatus, type Severity } from "@/lib/catalog/types";

interface CheckResultView {
  id: string;
  status: CheckStatus;
  evidence: string;
  title: string;
  severity: Severity | null;
}

const CHECK_STATUS_STYLES: Record<CheckStatus, string> = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  review: "bg-yellow-100 text-yellow-800",
  skip: "bg-slate-100 text-slate-600",
  not_automated: "bg-slate-100 text-slate-400",
};

const STAGE_LABELS: Record<Run["stage"], string> = {
  clone: "레포 Clone",
  build: "Docker 빌드",
  sandbox: "Sandbox 실행",
  ansible: "Ansible 점검",
  rule_eval: "가이드 기반 룰 평가",
  claude: "Claude 분석",
  done: "완료",
};

const STATUS_LABELS: Record<Run["status"], string> = {
  running: "진행 중",
  succeeded: "성공",
  failed: "실패",
};

const STATUS_STYLES: Record<Run["status"], string> = {
  running: "bg-blue-100 text-blue-800",
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export function RunStatus({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [checks, setChecks] = useState<CheckResultView[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.status === 404) {
        if (!cancelled) setNotFound(true);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setRun(data.run);
      setEvents(data.events);
      setChecks(data.checks);
      // Stop polling once the run has finished this slice's pipeline
      // (currently ends at rule_eval; #40 extends this to "claude"/"done").
      if (data.run.status !== "running") return;
      timer = setTimeout(poll, 2000);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  if (notFound) return <p className="text-red-600">해당 실행을 찾을 수 없습니다.</p>;
  if (!run) return <p className="text-slate-500">불러오는 중…</p>;

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm ${STATUS_STYLES[run.status]}`}>
          {STAGE_LABELS[run.stage]} · {STATUS_LABELS[run.status]}
        </span>
      </div>
      <p className="mt-2 break-all text-sm text-slate-600">{run.repoUrl}</p>
      {run.imageTag && (
        <p className="mt-1 text-sm text-slate-600">이미지 태그: {run.imageTag}</p>
      )}
      {run.containerName && (
        <p className="mt-1 text-sm text-slate-600">
          Sandbox 컨테이너: {run.containerName}
        </p>
      )}
      {run.errorMessage && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-red-50 p-3 text-xs text-red-800">
          {run.errorMessage}
        </pre>
      )}

      {checks.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-medium text-slate-500">점검 결과</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-1 pr-4">ID</th>
                <th className="py-1 pr-4">항목</th>
                <th className="py-1 pr-4">판정</th>
                <th className="py-1 pr-4">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-4 font-mono">{check.id}</td>
                  <td className="py-2 pr-4">{check.title}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${CHECK_STATUS_STYLES[check.status]}`}
                    >
                      {CHECK_STATUS_LABELS[check.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{check.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="mt-6 text-sm font-medium text-slate-500">진행 이력</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {events.map((event) => (
          <li key={event.id} className="flex gap-2">
            <span className="text-slate-400">{event.createdAt}</span>
            <span>
              {STAGE_LABELS[event.stage]} → {STATUS_LABELS[event.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
