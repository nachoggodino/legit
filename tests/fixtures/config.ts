import type { LegitConfig, RepositoryConfig } from "@/server/config";

export function makeTestRepo(overrides: Partial<RepositoryConfig> = {}): RepositoryConfig {
  return {
    id: "research",
    slug: "research",
    name: "Research Wiki",
    provider: "github",
    repoUrl: "https://github.com/example/research.git",
    defaultBranch: "main",
    docsPath: "docs",
    visibility: "private",
    ai: { enabled: true },
    commit: { mode: "merge-request", targetBranch: "main", branchPrefix: "legit/" },
    ...overrides,
  };
}

export function makeTestConfig(overrides: Partial<LegitConfig> = {}): LegitConfig {
  const repos = overrides.repos ?? [makeTestRepo()];

  return {
    app: { name: "Legit" },
    auth: { defaultRole: "viewer", admins: { emails: [], domains: [] } },
    ai: {
      enabled: false,
      baseUrlEnv: "AI_BASE_URL",
      apiKeyEnv: "AI_API_KEY",
      defaultModel: "gpt-4o",
      maxContextTokens: 150000,
      allowAnonymous: false,
    },
    sync: { intervalSeconds: 5, pullOnStartup: true, reindexOnChange: true },
    repos,
    ...overrides,
  };
}
