export type BadgeStatus = "pass" | "fail" | "review" | "neutral";

// Kinetic 배지 규칙: 동일 색상의 저채도(10~15%) 배경 + 고대비 텍스트, pill 형태.
const CLASSES: Record<BadgeStatus, string> = {
  pass: "bg-pass/10 text-pass",
  fail: "bg-fail/10 text-fail",
  review: "bg-review/15 text-review",
  neutral: "bg-neutral/15 text-muted",
};

export function statusBadgeClass(status: BadgeStatus): string {
  return CLASSES[status];
}
