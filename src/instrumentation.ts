export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSeedAdmin } = await import("@/lib/auth/seedAdmin");
    ensureSeedAdmin();
    const { startCvePoller } = await import("@/lib/cve/poller");
    startCvePoller();
    const { startScheduler } = await import("@/lib/scheduling/scheduler");
    startScheduler();
  }
}
