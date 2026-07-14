import type { CveSeverity } from "@/lib/cve/nvdClient";
import type { FeedRow } from "./feedStore";

// CveFeedView에서 옮겨온 심각도 라벨. 뷰도 여기서 import한다(중복 정의 금지).
export const SEVERITY_LABEL: Record<CveSeverity, string> = {
  critical: "심각", high: "높음", medium: "중간", low: "낮음", unknown: "미상",
};

// 피드에 모드(전체/조치대상)와 검색어를 AND로 적용. 순수 함수(서버 전용 모듈 import 금지).
export function applyCveFilter(
  feed: FeedRow[],
  mode: "all" | "actionable",
  query: string,
  ko: Record<string, string>,
): FeedRow[] {
  const base = mode === "actionable" ? feed.filter((c) => c.assetMatches > 0) : feed;
  const q = query.trim().toLowerCase();
  if (!q) return base;
  return base.filter((c) =>
    [c.cveId, ko[c.cveId] ?? c.summary, SEVERITY_LABEL[c.severity], c.severity]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
