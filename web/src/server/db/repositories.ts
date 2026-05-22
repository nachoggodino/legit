import { eq } from "drizzle-orm";
import type { RepositoryConfig } from "@/server/config";
import { repoSyncState, repositories } from "./schema";
import type { DbClient } from "./client";

export function importRepositoriesFromConfig(db: DbClient, repos: RepositoryConfig[]): void {
  const now = new Date();

  for (const repo of repos) {
    db.insert(repositories)
      .values({
        id: repo.id,
        slug: repo.slug,
        name: repo.name,
        provider: repo.provider,
        repoUrl: repo.repoUrl,
        defaultBranch: repo.defaultBranch,
        docsPath: repo.docsPath,
        visibility: repo.visibility,
        commitMode: repo.commit.mode,
        commitTargetBranch: repo.commit.targetBranch,
        commitBranchPrefix: repo.commit.branchPrefix,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: repositories.id,
        set: {
          slug: repo.slug,
          name: repo.name,
          provider: repo.provider,
          repoUrl: repo.repoUrl,
          defaultBranch: repo.defaultBranch,
          docsPath: repo.docsPath,
          visibility: repo.visibility,
          commitMode: repo.commit.mode,
          commitTargetBranch: repo.commit.targetBranch,
          commitBranchPrefix: repo.commit.branchPrefix,
          updatedAt: now,
        },
      })
      .run();

    db.insert(repoSyncState)
      .values({
        repoId: repo.id,
        status: "idle",
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

export function listRepositories(db: DbClient) {
  return db.select().from(repositories).orderBy(repositories.name).all();
}

export function listRepositorySyncStatuses(db: DbClient) {
  return db
    .select({
      id: repositories.id,
      slug: repositories.slug,
      name: repositories.name,
      provider: repositories.provider,
      repoUrl: repositories.repoUrl,
      defaultBranch: repositories.defaultBranch,
      visibility: repositories.visibility,
      status: repoSyncState.status,
      lastSyncedCommit: repoSyncState.lastSyncedCommit,
      lastSyncStartedAt: repoSyncState.lastSyncStartedAt,
      lastSyncFinishedAt: repoSyncState.lastSyncFinishedAt,
      lastError: repoSyncState.lastError,
      updatedAt: repoSyncState.updatedAt,
    })
    .from(repositories)
    .leftJoin(repoSyncState, eq(repositories.id, repoSyncState.repoId))
    .orderBy(repositories.name)
    .all();
}

export function getRepositoryBySlug(db: DbClient, slug: string) {
  return db.select().from(repositories).where(eq(repositories.slug, slug)).get();
}

export function getRepositoryById(db: DbClient, id: string) {
  return db.select().from(repositories).where(eq(repositories.id, id)).get();
}
