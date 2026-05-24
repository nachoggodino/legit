import fs from "node:fs";
import type { LegitConfig, RepositoryConfig } from "@/server/config";
import { getRuntimeDatabase, importRepositoriesFromConfig } from "@/server/db";
import { resolveRepoPath } from "@/server/git";
import { syncRepository, waitForRepoUnlock } from "@/server/sync";
import { resolveDocsRoot, resolveRouteDocument, type ResolvedDocumentPath } from "./paths";

type LoadRouteDocumentDeps = {
  getRuntimeDatabase?: typeof getRuntimeDatabase;
  importRepositoriesFromConfig?: typeof importRepositoriesFromConfig;
  resolveRepoPath?: typeof resolveRepoPath;
  resolveDocsRoot?: typeof resolveDocsRoot;
  resolveRouteDocument?: typeof resolveRouteDocument;
  syncRepository?: typeof syncRepository;
  waitForRepoUnlock?: typeof waitForRepoUnlock;
  logger?: Pick<typeof console, "error">;
};

function repoContentMissing(
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  reposRoot: string | undefined,
  deps: Required<Pick<LoadRouteDocumentDeps, "resolveRepoPath" | "resolveDocsRoot">>,
): boolean {
  const repoRoot = deps.resolveRepoPath(repo.id, reposRoot);
  if (!fs.existsSync(repoRoot)) {
    return true;
  }

  try {
    return !fs.existsSync(deps.resolveDocsRoot(repo, reposRoot));
  } catch {
    return true;
  }
}

export async function loadRouteDocument(
  config: LegitConfig,
  repo: RepositoryConfig,
  segments: string[] = [],
  options: { reposRoot?: string; deps?: LoadRouteDocumentDeps } = {},
): Promise<ResolvedDocumentPath | null> {
  const deps = {
    getRuntimeDatabase,
    importRepositoriesFromConfig,
    resolveRepoPath,
    resolveDocsRoot,
    resolveRouteDocument,
    syncRepository,
    waitForRepoUnlock,
    logger: console,
    ...options.deps,
  };

  const resolved = deps.resolveRouteDocument(repo, segments, { reposRoot: options.reposRoot });
  if (resolved || !repoContentMissing(repo, options.reposRoot, deps)) {
    return resolved;
  }

  const { db } = deps.getRuntimeDatabase();
  deps.importRepositoriesFromConfig(db, [repo]);

  try {
    await deps.syncRepository(db, repo, {
      reposRoot: options.reposRoot,
      reindexOnChange: config.sync.reindexOnChange,
    });
  } catch (error) {
    deps.logger.error("Route document sync fallback failed", {
      repoId: repo.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await deps.waitForRepoUnlock(repo.id);
  }

  return deps.resolveRouteDocument(repo, segments, { reposRoot: options.reposRoot });
}
