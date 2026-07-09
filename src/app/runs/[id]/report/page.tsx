import { ReportView } from "./ReportView";

export default async function RunReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <ReportView runId={id} />
    </main>
  );
}
