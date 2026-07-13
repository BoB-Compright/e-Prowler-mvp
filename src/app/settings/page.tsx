import { getAiAnalysisEnabled } from "@/lib/settings/store";
import { AiAnalysisToggle } from "../_components/AiAnalysisToggle";
import { Card } from "../_components/Card";

// 설정 페이지: 런타임 앱 설정. 현재는 AI 분석 토글(대시보드에서 이전).
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">설정</h1>
        <p className="mt-1 text-[13px] text-muted">런타임 동작을 제어합니다.</p>
      </div>
      <Card title="AI 분석 (Claude)">
        <p className="mb-4 text-[13px] text-muted">
          점검·CVE 분석 시 Claude로 판정 근거·조치·영향분석을 생성합니다. 기본은 꺼짐(토큰 절약).
        </p>
        <AiAnalysisToggle initialEnabled={getAiAnalysisEnabled()} />
      </Card>
    </main>
  );
}
