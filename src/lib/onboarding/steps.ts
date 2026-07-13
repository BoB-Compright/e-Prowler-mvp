export interface OnboardingStep {
  key: string;
  anchor: string | null; // data-tour 값. center 스텝이면 null
  stepNumber?: number; // 순번 배지에 표시할 숫자(환영·완료 스텝은 없음)
  title: string;
  body: string;
  placement: "center" | "auto";
  cta?: { label: string; href: string };
  preview?: "scan" | "progress" | "results" | "share";
}

// 업데이트된 투어(신규 스텝 포함)이므로 done-key를 v2로 올린다 — 기존 열람자도 1회 자동 노출.
export const ONBOARDING_DONE_KEY = "nhg_onboarding_done_v2";
export const ONBOARDING_FORCE_KEY = "nhg_onboarding_force";

// 아직 투어를 보지 않았으면 첫 로그인 시 자동 시작한다(자산 수 무관).
export function shouldAutoStart(seen: boolean): boolean {
  return !seen;
}

// 실 사용 흐름: 등록 → 점검 → 진행 → 분석 보고서 → AI 분석 → 실시간 CVE 대응 → 공유.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "welcome",
    anchor: null,
    placement: "center",
    title: "환영합니다",
    body: "NH-Guardian에 오신 걸 환영합니다. 자산 점검부터 분석 보고서·실시간 CVE 대응까지 차근차근 안내할게요.",
  },
  {
    key: "register",
    anchor: "asset-register",
    stepNumber: 1,
    placement: "auto",
    title: "자산 등록",
    body: "점검할 서버·레포를 등록하세요. 엑셀 업로드로 여러 개를 한 번에 올릴 수 있어요.",
  },
  {
    key: "scan",
    anchor: "nav-projects",
    stepNumber: 2,
    placement: "auto",
    title: "점검 실행",
    body: "자산을 프로젝트로 묶고, 선택 일괄 점검하거나 프로젝트에서 전체(Fleet) 점검을 실행하세요.",
    preview: "scan",
  },
  {
    key: "progress",
    anchor: "nav-runs",
    stepNumber: 3,
    placement: "auto",
    title: "점검 진행",
    body: "점검이 시작되면 단계·진행률이 실시간으로 표시됩니다.",
    preview: "progress",
  },
  {
    key: "results",
    anchor: "nav-dashboard",
    stepNumber: 4,
    placement: "auto",
    title: "분석 보고서",
    body: "완료되면 대시보드 점수·활동 피드에 반영되고, 각 리포트에서 취약 항목·CVE·AI 분석 근거·조치를 봅니다.",
    preview: "results",
  },
  {
    key: "ai-analysis",
    anchor: "nav-settings",
    stepNumber: 5,
    placement: "auto",
    title: "AI 분석 켜기",
    body: "설정에서 AI 분석(Claude)을 켜면 점검·CVE에 대한 판정 근거·조치·영향분석을 자동 생성합니다. 기본은 꺼짐(토큰 절약).",
  },
  {
    key: "cve-feed",
    anchor: "nav-cve",
    stepNumber: 6,
    placement: "auto",
    title: "실시간 CVE 대응",
    body: "CVE 피드는 NVD에서 수집한 취약점을 보유 자산과 대조해 '지금 조치할 것'만 골라냅니다. 새 매칭은 우하단 알림으로 즉시 뜹니다.",
  },
  {
    key: "share",
    anchor: "nav-projects",
    stepNumber: 7,
    placement: "auto",
    title: "PM에게 공유",
    body: "프로젝트 상세의 '공유 설정'에서 담당 PM에게 점검 리포트를 공유 링크로 전달할 수 있어요.",
    preview: "share",
  },
  {
    key: "done",
    anchor: null,
    placement: "center",
    title: "준비됐습니다",
    body: "첫 자산을 등록해 시작해 보세요.",
    cta: { label: "자산 등록하기", href: "/assets/new" },
  },
];
