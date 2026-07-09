export function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-[12px] font-bold uppercase tracking-[0.05em] text-muted ${className}`}>
      {children}
    </span>
  );
}
