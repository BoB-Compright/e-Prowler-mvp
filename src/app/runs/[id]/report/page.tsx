import { ReportView } from "./ReportView";

export default async function RunReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <ReportView runId={id} />
    </main>
  );
}
