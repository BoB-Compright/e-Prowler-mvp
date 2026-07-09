import { statusBadgeClass, type BadgeStatus } from "./statusBadgeStyles";

export function StatusBadge({
  status,
  children,
}: {
  status: BadgeStatus;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(status)}`}
    >
      {children}
    </span>
  );
}
