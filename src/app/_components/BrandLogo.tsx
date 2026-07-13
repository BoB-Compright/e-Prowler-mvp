import Link from "next/link";

// 보안 점검 솔루션을 상징하는 방패+체크 아이콘. 둥근 사각 배지(primary) 안에
// 흰색 스트로크로 그려, 사이드바 내비의 스트로크 아이콘 톤과 맞춘다.
function ShieldCheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7 3v5.5c0 4-3 6.9-7 8.5-4-1.6-7-4.5-7-8.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// NH-Guardian 워드마크. 클릭 시 대시보드(/)로 이동한다.
// `subtext`가 true면 "자산 보안 점검" 보조 문구를 함께 보여준다(사이드바용).
export function BrandLogo({ subtext = false }: { subtext?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="NH-Guardian 대시보드로 이동">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary bg-primary text-white">
        <ShieldCheckIcon />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-bold leading-tight tracking-tight text-primary">
          NH-Guardian
        </span>
        {subtext && <span className="block font-mono text-[11px] text-muted">AI 상시 보안 점검 체계</span>}
      </span>
    </Link>
  );
}
