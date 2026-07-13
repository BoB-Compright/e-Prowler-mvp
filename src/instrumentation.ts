export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSeedAdmin } = await import("@/lib/auth/seedAdmin");
    ensureSeedAdmin();
    const { startInventoryPoller } = await import("@/lib/cve/poller");
    startInventoryPoller();
    const { startCveDeltaWatcher } = await import("@/lib/cve/deltaWatcher");
    startCveDeltaWatcher();
    const { startScheduler } = await import("@/lib/scheduling/scheduler");
    startScheduler();
  }
}
