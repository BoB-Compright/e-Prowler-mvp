// CVE 피드 화면(/cve)의 시연용 시드 데이터.
//
// 이 8건은 "고위험(CVSS 높음)이라도 자산 매칭이 없으면 조치 불필요, 오래된
// CVE라도 매칭되면 조치 필요"라는 판정 로직을 대비시키려고 고른 예시다.
// 실 NVD 피드/자산 대조가 아니라 화면·로직 시연을 위한 고정 데이터이므로
// 화면에도 "시연 데이터" 배지로 명시한다. 실데이터 연동은 별도 사이클
// (델타워처가 미매칭 피드 CVE까지 저장 + CVE 단위 집계)에서 다룬다.

export type DemoSeverity = "Critical" | "High" | "Medium";

export interface DemoFeedCve {
  // 수집 시각(피드에 들어온 시점)까지 경과한 분 — 정렬은 등록일이 아니라 이
  // 값(최근 유입 우선) 기준이다. 상대시간 라벨은 collectedLabel에 그대로 둔다.
  collectedMinutesAgo: number;
  collectedLabel: string;
  publishedDate: string; // 등록(최초 공개) 일자
  severity: DemoSeverity;
  cveId: string;
  description: string; // 한국어 설명
  cvss: number;
  assetMatches: number; // 우리 자산 인벤토리와 대조한 매칭 대수(0 = 영향 없음)
}

// 수집 시각순(최근 유입이 위)으로 정렬해 둔다. 화면은 collectedMinutesAgo로
// 다시 정렬하므로 순서가 흐트러져도 안전하다.
export const DEMO_CVE_FEED: DemoFeedCve[] = [
  {
    collectedMinutesAgo: 0,
    collectedLabel: "방금",
    publishedDate: "2026-07-08",
    severity: "Critical",
    cveId: "CVE-2026-1042",
    description: "OpenSSL 3.x 인증서 체인 검증 우회",
    cvss: 9.1,
    assetMatches: 0,
  },
  {
    collectedMinutesAgo: 2,
    collectedLabel: "2분 전",
    publishedDate: "2024-01-31",
    severity: "High",
    cveId: "CVE-2024-1086",
    description: "커널 nf_tables Use-After-Free",
    cvss: 7.8,
    assetMatches: 1,
  },
  {
    collectedMinutesAgo: 8,
    collectedLabel: "8분 전",
    publishedDate: "2026-07-07",
    severity: "High",
    cveId: "CVE-2026-0733",
    description: "nginx HTTP/3 QUIC 메모리 손상",
    cvss: 8.2,
    assetMatches: 0,
  },
  {
    collectedMinutesAgo: 15,
    collectedLabel: "15분 전",
    publishedDate: "2024-07-01",
    severity: "High",
    cveId: "CVE-2024-6387",
    description: "OpenSSH regreSSHion 원격 코드 실행",
    cvss: 8.1,
    assetMatches: 2,
  },
  {
    collectedMinutesAgo: 23,
    collectedLabel: "23분 전",
    publishedDate: "2026-07-06",
    severity: "Medium",
    cveId: "CVE-2026-0511",
    description: "systemd-resolved DNS 캐시 오염",
    cvss: 6.5,
    assetMatches: 0,
  },
  {
    collectedMinutesAgo: 41,
    collectedLabel: "41분 전",
    publishedDate: "2023-10-11",
    severity: "Critical",
    cveId: "CVE-2023-38545",
    description: "curl SOCKS5 프록시 힙 버퍼 오버플로",
    cvss: 9.8,
    assetMatches: 1,
  },
  {
    collectedMinutesAgo: 60,
    collectedLabel: "1시간 전",
    publishedDate: "2026-07-05",
    severity: "High",
    cveId: "CVE-2026-0298",
    description: "containerd 컨테이너 권한 상승",
    cvss: 7.0,
    assetMatches: 0,
  },
  {
    collectedMinutesAgo: 120,
    collectedLabel: "2시간 전",
    publishedDate: "2025-12-19",
    severity: "High",
    cveId: "CVE-2025-9921",
    description: "PostgreSQL 확장 로딩 임의 코드 실행",
    cvss: 8.8,
    assetMatches: 0,
  },
];

// 점검 결과는 절대 하드코딩하지 않고 자산 매칭 수에서 파생한다:
// 매칭 > 0 → "조치 필요", 그 외 → "해당 없음".
export function actionRequired(assetMatches: number): boolean {
  return assetMatches > 0;
}
