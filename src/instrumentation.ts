export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCvePoller } = await import("@/lib/cve/poller");
    startCvePoller();
  }
}
