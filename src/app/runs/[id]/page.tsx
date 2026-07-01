import { RunStatus } from "./RunStatus";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-[880px] px-6 py-14">
      <RunStatus runId={id} />
    </main>
  );
}
