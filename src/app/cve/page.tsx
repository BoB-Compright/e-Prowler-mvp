import { DEMO_CVE_FEED } from "@/lib/cve/demoFeed";
import { CveFeedView } from "./CveFeedView";

// CVE 피드 화면: NVD 피드에서 수집한 CVE를 우리 자산 인벤토리와 대조해
// "실제로 우리에게 영향을 주는 것"만 골라내는 것이 목적. 현재는 시연용 시드
// 데이터(@/lib/cve/demoFeed)로 화면·판정 로직을 보여준다.
export default function CveFeedPage() {
  return <CveFeedView feed={DEMO_CVE_FEED} />;
}
