import { getShareLinkStatus } from "@/lib/projects/store";
import { ShareGate } from "./ShareGate";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Checked server-side, before the page ever renders a password form — an
  // invalid/disabled/revoked token never gets to prompt for a password.
  const status = getShareLinkStatus(token);
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <ShareGate token={token} initialStatus={status} />
    </main>
  );
}
