import { StatusBadge } from "../StatusBadge";
import { SharePreview } from "./SharePreview";

const box = "rounded-xl border border-border bg-bg p-3 text-left";
const rowLabel = "text-[11px]";

// ② 프로젝트로 묶고 점검 — 자산 목록의 체크박스 + 일괄 작업 액션 바를 본뜬 목업.
function ScanPreview() {
  const rows = [
    { name: "web-01", type: "서버", on: true },
    { name: "api-gateway / Dockerfile", type: "레포", on: true },
    { name: "db-01", type: "서버", on: false },
  ];
  return (
    <div className={`mt-3 ${box}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1.5">
        <span className="text-[11px] font-semibold">2개 선택</span>
        <span className="rounded-md border border-primary px-2 py-0.5 text-[10px] font-semibold text-primary">일괄 점검</span>
        <span className="rounded-md border border-primary px-2 py-0.5 text-[10px] font-semibold text-primary">프로젝트 이동</span>
        <span className="rounded-md border border-fail px-2 py-0.5 text-[10px] font-semibold text-fail">삭제</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 py-1.5">
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                r.on ? "border-primary bg-primary text-white" : "border-border"
              }`}
            >
              {r.on && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{r.name}</span>
            <span className="shrink-0 text-[10px] text-muted">{r.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ③ 점검 진행 — 배치 진행 화면(전체 진행바 + run별 단계/미니 진행바)을 본뜬 목업.
function ProgressPreview() {
  const runs = [
    { name: "web-01", pct: 100, label: "완료 · 취약 3", done: true },
    { name: "api-gateway", pct: 60, label: "Ansible 점검", done: false },
    { name: "db-01", pct: 25, label: "SSH 연결", done: false },
  ];
  return (
    <div className={`mt-3 ${box}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold">일괄 점검 · 완료 1 / 3</span>
        <span className="font-mono text-[10px] text-muted">62%</span>
      </div>
      <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary" style={{ width: "62%" }} />
      </div>
      <ul className="flex flex-col gap-1.5">
        {runs.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-[11px] font-medium">{r.name}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <span
                className={`block h-full rounded-full ${r.done ? "bg-pass" : "bg-primary"}`}
                style={{ width: `${r.pct}%` }}
              />
            </span>
            <span className="w-24 shrink-0 text-right text-[10px] text-muted">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ④ 분석 결과 — 대시보드 종합 점수·판정 요약을 본뜬 목업.
function ResultsPreview() {
  return (
    <div className={`mt-3 ${box}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-4 border-review">
          <span className="text-[15px] font-bold leading-none">72</span>
          <span className="text-[8px] text-muted">/100</span>
        </span>
        <div className="min-w-0">
          <p className={`${rowLabel} font-semibold`}>종합 보안 점수 · 주의</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <StatusBadge status="fail">취약 12</StatusBadge>
            <StatusBadge status="review">검토 1</StatusBadge>
            <StatusBadge status="pass">양호 25</StatusBadge>
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
        리포트에서 취약 항목·CVE·AI 분석 상세를 확인합니다.
      </p>
    </div>
  );
}

// 온보딩 스텝의 preview 종류에 맞는 예시 미리보기를 렌더한다.
export function StepPreview({ kind }: { kind: "scan" | "progress" | "results" | "share" }) {
  switch (kind) {
    case "scan":
      return <ScanPreview />;
    case "progress":
      return <ProgressPreview />;
    case "results":
      return <ResultsPreview />;
    case "share":
      return <SharePreview />;
  }
}
