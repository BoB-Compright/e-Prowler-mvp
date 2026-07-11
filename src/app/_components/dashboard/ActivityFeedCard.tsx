import Link from "next/link";
import { Card } from "../Card";
import { formatRelativeTime, type ActivityEvent } from "@/lib/dashboard/activityFeed";

const TONE_COLOR: Record<ActivityEvent["tone"], string> = {
  pass: "var(--color-pass)",
  fail: "var(--color-fail)",
  review: "var(--color-review)",
  progress: "var(--color-primary)",
  neutral: "var(--color-neutral)",
};

export function ActivityFeedCard({ events, now }: { events: ActivityEvent[]; now: Date }) {
  return (
    <Card title="최근 활동" bodyClassName="p-0">
      {events.length === 0 ? (
        <p className="p-5 text-[13px] text-muted italic">아직 활동이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((ev) => (
            <li key={ev.key}>
              <Link href={ev.href} className="flex gap-3 px-5 py-3 text-sm hover:bg-bg">
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TONE_COLOR[ev.tone] }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{ev.title}</span>
                    <span className="ml-auto whitespace-nowrap font-mono text-[12px] text-muted">
                      {formatRelativeTime(ev.at, now)}
                    </span>
                  </span>
                  <span className="text-[13px] text-muted">{ev.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
