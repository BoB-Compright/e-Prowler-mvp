import type { AssetStatusKind } from "@/lib/pipeline/assetStatus";

export type DonutBucketKey = "pass" | "review" | "fail" | "running" | "unchecked";

export interface DonutBucket {
  key: DonutBucketKey;
  label: string;
  count: number;
}

// 도넛 버킷 순서는 고정 (dataviz: 순위에 따라 색/순서를 바꾸지 않는다)
const BUCKET_ORDER: { key: DonutBucketKey; label: string }[] = [
  { key: "pass", label: "양호" },
  { key: "review", label: "검토" },
  { key: "fail", label: "취약" },
  { key: "running", label: "진행 중" },
  { key: "unchecked", label: "미점검" },
];

// error(실행 실패)/cancelled(취소)는 "점검 결과가 없는 상태"이므로 보안 상태
// 분포에서는 미점검으로 묶는다. 개별 실패는 활동 피드와 자산 페이지에서 드러난다.
function bucketOf(kind: AssetStatusKind): DonutBucketKey {
  if (kind === "pass" || kind === "review" || kind === "fail" || kind === "running") return kind;
  return "unchecked";
}

export function computeStatusDistribution(kinds: AssetStatusKind[]): DonutBucket[] {
  const counts: Record<DonutBucketKey, number> = { pass: 0, review: 0, fail: 0, running: 0, unchecked: 0 };
  for (const kind of kinds) counts[bucketOf(kind)] += 1;
  return BUCKET_ORDER.map(({ key, label }) => ({ key, label, count: counts[key] }));
}
