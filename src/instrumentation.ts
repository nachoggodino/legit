export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRuntimeSyncScheduler } = await import("./server/sync/runtime");
    startRuntimeSyncScheduler();
  }
}
