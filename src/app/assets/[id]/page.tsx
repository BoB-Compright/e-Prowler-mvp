import { notFound } from "next/navigation";
import { getAsset } from "@/lib/assets/store";
import { listRuns } from "@/lib/pipeline/runs";
import { listCveMatches } from "@/lib/cve/store";
import { CveList } from "./CveList";
import { getScheduleByAsset } from "@/lib/scheduling/store";
import { ScheduleForm } from "./ScheduleForm";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) notFound();

  const runs = listRuns().filter((run) => run.assetId === id);
  const schedule = getScheduleByAsset(id) ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-lg font-bold text-[var(--color-text)]">{asset.displayName}</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        {asset.type === "repo" ? asset.repoUrl : `${asset.hostIp}:${asset.sshPort}`}
      </p>
      {asset.type === "server" && (
        <div className="mb-6">
          <CveList matches={listCveMatches(id)} />
        </div>
      )}
      <div className="mb-6">
        <ScheduleForm assetId={id} initialSchedule={schedule} />
      </div>
      <h2 className="mb-2 text-sm font-bold">점검 이력</h2>
      <ul className="text-sm">
        {runs.map((run) => (
          <li key={run.id} className="border-b border-[var(--color-border)] py-2">{run.createdAt} — {run.status}</li>
        ))}
      </ul>
    </main>
  );
}
