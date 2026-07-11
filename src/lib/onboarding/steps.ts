export interface OnboardingStep {
  key: string;
  anchor: string | null; // data-tour 값. center 스텝이면 null
  title: string;
  body: string;
  placement: "center" | "auto";
  cta?: { label: string; href: string };
}

export const ONBOARDING_DONE_KEY = "nhg_onboarding_done";
export const ONBOARDING_FORCE_KEY = "nhg_onboarding_force";

// 첫 사용자(자산 0개)가 아직 투어를 보지 않았으면 자동 시작한다.
export function shouldAutoStart(assetCount: number, seen: boolean): boolean {
  return assetCount === 0 && !seen;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "welcome",
    anchor: null,
    placement: "center",
    title: "환영합니다",
    body: "NH-Guardian에 오신 걸 환영합니다. 3단계로 첫 점검을 안내할게요.",
  },
  {
    key: "register",
    anchor: "asset-register",
    placement: "auto",
    title: "① 자산 등록",
    body: "점검할 서버·레포를 등록하세요. 엑셀 업로드로 여러 개를 한 번에 올릴 수 있어요.",
  },
  {
    key: "group-scan",
    anchor: "nav-projects",
    placement: "auto",
    title: "② 프로젝트로 묶고 점검",
    body: "자산을 프로젝트로 묶고, 체크박스로 선택해 일괄 점검하거나 프로젝트에서 전체(Fleet) 점검을 실행하세요.",
  },
  {
    key: "progress",
    anchor: "nav-runs",
    placement: "auto",
    title: "③ 점검 진행",
    body: "점검이 시작되면 단계·진행률이 실시간으로 표시됩니다.",
  },
  {
    key: "results",
    anchor: "nav-dashboard",
    placement: "auto",
    title: "④ 분석 결과",
    body: "완료되면 대시보드 점수·활동 피드에 반영되고, 각 점검 리포트에서 취약 항목·CVE·AI 분석 상세를 봅니다.",
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
