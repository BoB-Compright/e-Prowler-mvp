import type { AssetKind } from "@/lib/assets/kind";
import { ASSET_KIND_LABEL } from "@/lib/assets/kind";

const svgProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function KindIcon({ kind }: { kind: AssetKind }) {
  switch (kind) {
    case "os": // 모니터
      return (
        <svg {...svgProps}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "web": // 지구본
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
      );
    case "was": // 톱니
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </svg>
      );
    case "db": // 원통
      return (
        <svg {...svgProps}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </svg>
      );
    default: // 기타 — 상자
      return (
        <svg {...svgProps}>
          <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
        </svg>
      );
  }
}

// 자산의 실질 구분을 아이콘+짧은 라벨로 표시. 큰 구분(레포/서버)과 별개.
export function AssetKindBadge({ kind }: { kind: AssetKind }) {
  const label = ASSET_KIND_LABEL[kind];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] text-muted"
      title={`실질 구분: ${label}`}
    >
      <KindIcon kind={kind} />
      {label}
    </span>
  );
}
