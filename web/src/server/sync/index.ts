import { loadConfig, type CopisaurusConfig, type RepositoryConfig } from "@/server/config";
import { getRepoSyncState, getRuntimeDatabase, importRepositoriesFromConfig, markRepoSyncFailed, markRepoSyncStarted, markRepoSyncSucceeded } from "@/server/db";
import type { DbClient } from "@/server/db";
import { cloneOrPullRepository, redactGitUrl, type GitRunner, type SecretEnv } from "@/server/git";
import type { AuthUser } from "@/server/auth/types";
import { reindexRepositoryDocuments } from "@/server/search";

export type RepoSyncStatus = "idle" | "syncing" | "succeeded" | "failed";

const repoLocks = new Map<string, Promise<unknown>>();

export class RepoSyncLockedError extends Error {
  constructor(repoId: string) {
    super(`Repository ${repoId} already has sync, commit, or indexing work in progress.`);
    this.name = "RepoSyncLockedError";
  }
}

export async function withRepoLock<T>(repoId: string, work: () => Promise<T>): Promise<T> {
  if (repoLocks.has(repoId)) {
    throw new RepoSyncLockedError(repoId);
  }

  const promise = work();
  repoLocks.set(repoId, promise);

  try {
    return await promise;
  } finally {
    if (repoLocks.get(repoId) === promise) {
      repoLocks.delete(repoId);
    }
  }
}

export function isRepoLocked(repoId: string): boolean {
  return repoLocks.has(repoId);
}

export async function syncRepository(
  db: DbClient,
  repo: RepositoryConfig,
  options: {
    runner?: GitRunner;
    reposRoot?: string;
    env?: SecretEnv;
    reindexOnChange?: boolean;
  } = {},
): Promise<{ repoId: string; commit: string }> {
  return withRepoLock(repo.id, async () => {
    const previousCommit = getRepoSyncState(db, repo.id)?.lastSyncedCommit ?? null;
    markRepoSyncStarted(db, repo.id);

    try {
      const result = await cloneOrPullRepository(repo, options);
      markRepoSyncSucceeded(db, repo.id, result.commit);
      if (options.reindexOnChange && previousCommit !== result.commit) {
        reindexRepositoryDocuments(db, repo, { reposRoot: options.reposRoot, commit: result.commit });
      }
      return { repoId: repo.id, commit: result.commit };
    } catch (error) {
      const message = redactGitUrl(error instanceof Error ? error.message : String(error));
      markRepoSyncFailed(db, repo.id, message);
      throw new Error(message);
    }
  });
}

export async function syncConfiguredRepositories(
  db: DbClient,
  repos: RepositoryConfig[],
  options: {
    runner?: GitRunner;
    reposRoot?: string;
    env?: SecretEnv;
    reindexOnChange?: boolean;
  } = {},
): Promise<void> {
  await Promise.all(repos.map((repo) => syncRepository(db, repo, options)));
}

export async function requestManualRepoSync(
  repoId: string,
  options: {
    requireAdminUser?: () => Promise<AuthUser>;
    db?: DbClient;
    config?: CopisaurusConfig;
    runner?: GitRunner;
    reposRoot?: string;
    env?: SecretEnv;
  } = {},
): Promise<{ repoId: string; commit: string }> {
  const requireAdminUser = options.requireAdminUser ?? (await import("@/server/auth/session")).requireAdmin;
  await requireAdminUser();

  const db = options.db ?? getRuntimeDatabase().db;
  const config = options.config ?? loadConfig();
  importRepositoriesFromConfig(db, config.repos);

  const repo = config.repos.find((candidate) => candidate.id === repoId);

  if (!repo) {
    throw new Error("Repository not found.");
  }

  return syncRepository(db, repo, {
    runner: options.runner,
    reposRoot: options.reposRoot,
    env: options.env,
    reindexOnChange: config.sync.reindexOnChange,
  });
}

export type SyncSchedulerTimers = {
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

function summarizeSyncError(error: unknown): string {
  return redactGitUrl(error instanceof Error ? error.message : String(error));
}

export function createSyncScheduler(
  config: CopisaurusConfig,
  db: DbClient,
  options: {
    runner?: GitRunner;
    reposRoot?: string;
    env?: SecretEnv;
    timers?: SyncSchedulerTimers;
  } = {},
) {
  const timers = options.timers ?? {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: (handle: unknown) => {
      globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
    },
  };
  let intervalHandle: unknown = null;

  const run = async () => {
    importRepositoriesFromConfig(db, config.repos);

    try {
      await syncConfiguredRepositories(db, config.repos, {
        runner: options.runner,
        reposRoot: options.reposRoot,
        env: options.env,
        reindexOnChange: config.sync.reindexOnChange,
      });
    } catch (error) {
      console.error("Scheduled repository sync failed", {
        error: summarizeSyncError(error),
      });
    }
  };

  return {
    start() {
      importRepositoriesFromConfig(db, config.repos);

      if (config.sync.pullOnStartup) {
        void run();
      }

      intervalHandle = timers.setInterval(() => {
        void run();
      }, config.sync.intervalSeconds * 1000);
    },
    stop() {
      if (intervalHandle !== null) {
        timers.clearInterval(intervalHandle);
        intervalHandle = null;
      }
    },
    runOnce: run,
  };
}
