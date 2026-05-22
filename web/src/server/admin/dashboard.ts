import { buildAuthProviderStatuses } from "@/server/auth/providers";
import { loadConfig } from "@/server/config";
import { getRuntimeDatabase, importRepositoriesFromConfig, listRepositorySyncStatuses } from "@/server/db";
import { redactGitUrl } from "@/server/git";

export type AdminDashboardData = ReturnType<typeof getAdminDashboardData>;

export function getAdminDashboardData() {
  const config = loadConfig();
  const { db } = getRuntimeDatabase();
  importRepositoriesFromConfig(db, config.repos);

  return {
    repos: listRepositorySyncStatuses(db).map((repo) => ({
      ...repo,
      lastError: repo.lastError ? redactGitUrl(repo.lastError) : null,
    })),
    authProviderStatuses: buildAuthProviderStatuses(),
  };
}
