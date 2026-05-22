import { eq } from "drizzle-orm";
import { repoSyncState } from "./schema";
import type { DbClient } from "./client";

export type SyncStatus = "idle" | "syncing" | "succeeded" | "failed";

export function markRepoSyncStarted(db: DbClient, repoId: string, startedAt = new Date()): void {
  db.insert(repoSyncState)
    .values({
      repoId,
      status: "syncing",
      lastSyncStartedAt: startedAt,
      lastError: null,
      updatedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: repoSyncState.repoId,
      set: {
        status: "syncing",
        lastSyncStartedAt: startedAt,
        lastError: null,
        updatedAt: startedAt,
      },
    })
    .run();
}

export function markRepoSyncSucceeded(
  db: DbClient,
  repoId: string,
  commit: string | null,
  finishedAt = new Date(),
): void {
  db.update(repoSyncState)
    .set({
      status: "succeeded",
      lastSyncedCommit: commit,
      lastSyncFinishedAt: finishedAt,
      lastError: null,
      updatedAt: finishedAt,
    })
    .where(eq(repoSyncState.repoId, repoId))
    .run();
}

export function markRepoSyncFailed(db: DbClient, repoId: string, error: string, finishedAt = new Date()): void {
  db.update(repoSyncState)
    .set({
      status: "failed",
      lastSyncFinishedAt: finishedAt,
      lastError: error,
      updatedAt: finishedAt,
    })
    .where(eq(repoSyncState.repoId, repoId))
    .run();
}

export function getRepoSyncState(db: DbClient, repoId: string) {
  return db.select().from(repoSyncState).where(eq(repoSyncState.repoId, repoId)).get();
}
