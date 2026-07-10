import type { AssetStatusKind } from "@/lib/pipeline/assetStatus";
import type { BadgeStatus } from "./statusBadgeStyles";

export const ASSET_STATUS_BADGE: Record<AssetStatusKind, { status: BadgeStatus; label: string }> = {
  pass: { status: "pass", label: "양호" },
  fail: { status: "fail", label: "취약" },
  review: { status: "review", label: "검토" },
  error: { status: "fail", label: "실패" },
  running: { status: "progress", label: "진행 중" },
  cancelled: { status: "neutral", label: "취소됨" },
  none: { status: "neutral", label: "미점검" },
};
