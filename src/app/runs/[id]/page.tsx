import { RunStatus } from "./RunStatus";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[880px]">
        <RunStatus runId={id} />
      </div>
    </main>
  );
}
