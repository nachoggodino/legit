import { loadConfig } from "@/server/config";
import { getRuntimeDatabase } from "@/server/db";
import { createSyncScheduler } from "./index";
import { acquireFileLease } from "./lease";

let started = false;
const SCHEDULER_LEASE_STALE_MS = 10 * 60 * 1000;
let releaseSchedulerLease: (() => void) | null = null;

export function startRuntimeSyncScheduler(): void {
  if (process.env.LEGIT_DISABLE_SYNC_SCHEDULER === "true") {
    return;
  }

  if (started) {
    return;
  }

  const lease = acquireFileLease("scheduler", SCHEDULER_LEASE_STALE_MS);
  if (!lease.acquired) {
    console.warn("Skipping sync scheduler startup because another process holds the scheduler lease.");
    return;
  }

  started = true;
  releaseSchedulerLease = lease.release;
  const config = loadConfig();
  const { db } = getRuntimeDatabase();
  createSyncScheduler(config, db).start();
}

export function resetRuntimeSyncSchedulerForTests(): void {
  started = false;
  if (releaseSchedulerLease) {
    releaseSchedulerLease();
    releaseSchedulerLease = null;
  }
}
