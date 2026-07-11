export interface RunFeedInput {
  runId: string;
  assetName: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  failCount: number | null; // succeeded run의 취약(fail) 점검 항목 수
  reviewCount: number | null;
  at: string; // ISO (run.updatedAt)
}

export interface AssetFeedInput {
  assetId: string;
  assetName: string;
  at: string; // ISO (asset.createdAt)
}

// tone 값은 statusBadgeStyles의 BadgeStatus와 호환된다 — 페이지에서 그대로 색 매핑.
export interface ActivityEvent {
  key: string;
  href: string;
  title: string; // 자산명
  detail: string;
  tone: "pass" | "fail" | "review" | "progress" | "neutral";
  at: string;
}

function runEvent(run: RunFeedInput): ActivityEvent {
  const base = { key: `run-${run.runId}`, title: run.assetName, at: run.at };
  if (run.status === "running") {
    return { ...base, href: `/runs/${run.runId}`, detail: "점검 진행 중", tone: "progress" };
  }
  if (run.status === "failed") {
    return { ...base, href: `/runs/${run.runId}/report`, detail: "점검 실패", tone: "fail" };
  }
  if (run.status === "cancelled") {
    return { ...base, href: `/runs/${run.runId}/report`, detail: "점검 취소됨", tone: "neutral" };
  }
  const fail = run.failCount ?? 0;
  const review = run.reviewCount ?? 0;
  const summary = fail > 0 ? `취약 ${fail}건 · 검토 ${review}건` : review > 0 ? `검토 ${review}건` : "양호";
  const tone = fail > 0 ? ("fail" as const) : review > 0 ? ("review" as const) : ("pass" as const);
  return { ...base, href: `/runs/${run.runId}/report`, detail: `점검 완료 — ${summary}`, tone };
}

export function buildActivityFeed(
  runs: RunFeedInput[],
  assets: AssetFeedInput[],
  limit = 10,
): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...runs.map(runEvent),
    ...assets.map((a) => ({
      key: `asset-${a.assetId}`,
      href: `/assets/${a.assetId}`,
      title: a.assetName,
      detail: "자산 등록",
      tone: "neutral" as const,
      at: a.at,
    })),
  ];
  // ISO 8601은 문자열 비교가 시간 비교와 일치한다
  return events.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

export function formatRelativeTime(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 60_000) return "방금 전";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return iso.replace("T", " ").slice(5, 16); // "MM-DD HH:mm"
}
