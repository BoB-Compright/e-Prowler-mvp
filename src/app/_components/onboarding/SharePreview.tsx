import { StatusBadge } from "../StatusBadge";

// 프로젝트 상세의 "공유 설정"(ShareLinkPanel)을 축약해 본뜬 정적 예시 화면.
// 온보딩 PM 공유 단계에서 실제 공유 UI가 어떤 모습인지 보여주기 위한 목업으로,
// 상호작용/네트워크 호출은 없다.
export function SharePreview() {
  return (
    <div className="mt-3 rounded-xl border border-border bg-bg p-3 text-left">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[12px] font-semibold">공유 설정</span>
        <StatusBadge status="pass">활성</StatusBadge>
      </div>

      <p className="text-[11px] font-medium">PM 공유 링크</p>
      <div className="mt-1 flex gap-1.5">
        <span className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11px] text-muted">
          https://nh-guardian/share/9f3a2c…
        </span>
        <span className="shrink-0 rounded-lg border border-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary">
          복사
        </span>
      </div>

      <p className="mt-2.5 text-[11px] font-medium">링크 비밀번호</p>
      <div className="mt-1 flex gap-1.5">
        <span className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11px] text-muted">
          ••••••••
        </span>
        <span className="shrink-0 rounded-lg border border-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary">
          재발급
        </span>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
        PM은 이 링크와 비밀번호로 로그인 없이 점검 리포트를 열람합니다.
      </p>
    </div>
  );
}
