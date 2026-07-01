import { RunStatus } from "./RunStatus";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold">점검 실행 상태</h1>
      <div className="mt-6">
        <RunStatus runId={id} />
      </div>
    </main>
  );
}
