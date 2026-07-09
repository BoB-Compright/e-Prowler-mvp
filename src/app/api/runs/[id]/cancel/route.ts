import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { cancelRun, getRun } from "@/lib/pipeline/runs";
import { stopSandbox } from "@/lib/pipeline/sandbox";

// Cancels an in-progress run (#73). Only a "running" run may be cancelled —
// anything else (not found, already succeeded/failed/cancelled) is rejected
// so this can never flip a finished run's history after the fact.
//
// Cleanup here is best-effort and asymmetric across the two execution paths
// (see orchestrator.ts / serverScan.ts for the full rationale):
// - Container path: if the run already has a sandbox container, it is
//   force-removed (`docker rm -f`) right away. That's a genuine kill — any
//   in-flight Ansible docker-exec against it fails immediately instead of
//   idling out on its own timeout.
// - Server (SSH) path / no container yet: there is nothing to force-kill
//   here. Writing "cancelled" below still stops the run from the user's
//   perspective (polling stops, UI shows cancelled immediately); the
//   in-flight SSH/ansible-playbook call (if any) keeps running until it
//   naturally settles, at which point the pipeline's own isCancelled()
//   check stops it from advancing instead of overwriting this status.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = requireApiSession(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.status !== "running") {
    return NextResponse.json(
      { error: "진행 중인 점검만 취소할 수 있습니다" },
      { status: 409 },
    );
  }

  if (run.containerName) {
    await stopSandbox(run.containerName);
  }

  const cancelled = cancelRun(id, "사용자가 점검을 취소했습니다");
  return NextResponse.json({ run: cancelled });
}
