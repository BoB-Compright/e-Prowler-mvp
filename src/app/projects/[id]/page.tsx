import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects/store";
import { listAssets } from "@/lib/assets/store";
import { ShareLinkPanel } from "./ShareLinkPanel";
import { FleetScanButton } from "./FleetScanButton";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const assets = listAssets({ projectId: id });
  const serverCount = assets.filter((asset) => asset.type === "server").length;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-lg font-bold text-[var(--color-text)]">{project.name}</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">{project.pmName} · {project.pmEmail}</p>
      <ShareLinkPanel projectId={project.id} shareToken={project.shareToken} />
      <div className="mt-8 flex items-center justify-between gap-2.5">
        <h2 className="text-sm font-bold">소속 자산 ({assets.length})</h2>
        <FleetScanButton projectId={project.id} serverCount={serverCount} />
      </div>
      <ul className="mt-2 text-sm">
        {assets.map((asset) => (
          <li key={asset.id} className="border-b border-[var(--color-border)] py-2">
            {asset.displayName} ({asset.type === "repo" ? "레포" : "서버"})
          </li>
        ))}
      </ul>
    </main>
  );
}
