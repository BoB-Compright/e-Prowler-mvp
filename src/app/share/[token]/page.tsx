import { ShareGate } from "./ShareGate";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <ShareGate token={token} />
    </main>
  );
}
