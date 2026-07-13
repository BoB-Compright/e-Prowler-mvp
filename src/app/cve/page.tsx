import { listFeedForDisplay } from "@/lib/cve/feedStore";
import { getDb } from "@/lib/db";
import { CveFeedView } from "./CveFeedView";

// CVE 피드: NVD 피드에서 수집한 실제 CVE(feed_cves)를 우리 자산과 대조해 표시한다.
export const dynamic = "force-dynamic";

function getWatermark(): string | null {
  const row = getDb().prepare(`SELECT watermark FROM cve_delta_state WHERE id = 1`).get() as
    | { watermark: string }
    | undefined;
  return row?.watermark ?? null;
}

export default function CveFeedPage() {
  const feed = listFeedForDisplay(new Date());
  const watermark = getWatermark();
  const lastScan = watermark ? watermark.replace("T", " ").slice(0, 16) : "아직 없음";
  return <CveFeedView feed={feed} initialLastScan={lastScan} />;
}
