import { loadConfig } from "@/server/config";
import { getRuntimeDatabase } from "@/server/db";
import { createSyncScheduler } from "./index";

let started = false;

export function startRuntimeSyncScheduler(): void {
  if (process.env.LEGIT_DISABLE_SYNC_SCHEDULER === "true") {
    return;
  }

  if (started) {
    return;
  }

  started = true;
  const config = loadConfig();
  const { db } = getRuntimeDatabase();
  createSyncScheduler(config, db).start();
}

export function resetRuntimeSyncSchedulerForTests(): void {
  started = false;
}
