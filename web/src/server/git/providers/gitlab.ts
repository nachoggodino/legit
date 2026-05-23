import type { RepositoryConfig } from "@/server/config";
import { GitConfigError, redactGitUrl } from "@/server/git";
import type { GitAuthConfig, GitHostingProvider, MergeRequestInput, ProviderFetch } from "./types";

export const gitlabGitAuth: GitAuthConfig = {
  provider: "gitlab",
  tokenEnvName: "COPISAURUS_GITLAB_TOKEN",
  username: "oauth2",
};

function parseGitLabRepo(repoUrl: string): { projectPath: string; baseUrl: string; apiBaseUrl: string } {
  const url = new URL(repoUrl);
  const projectPath = url.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
  if (!projectPath || !projectPath.includes("/")) {
    throw new GitConfigError("GitLab repository URL must include group and project path.");
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  return {
    projectPath,
    baseUrl,
    apiBaseUrl: `${baseUrl}/api/v4`,
  };
}

export function createGitLabProvider(options: { fetch?: ProviderFetch; env?: NodeJS.ProcessEnv } = {}): GitHostingProvider {
  const fetchImpl = options.fetch ?? fetch;
  const env = options.env ?? process.env;

  return {
    getCommitUrl(repo: RepositoryConfig, commitSha: string) {
      const parsed = parseGitLabRepo(repo.repoUrl);
      return `${parsed.baseUrl}/${parsed.projectPath}/-/commit/${encodeURIComponent(commitSha)}`;
    },
    getBranchUrl(repo: RepositoryConfig, branch: string) {
      const parsed = parseGitLabRepo(repo.repoUrl);
      return `${parsed.baseUrl}/${parsed.projectPath}/-/tree/${encodeURIComponent(branch)}`;
    },
    async createMergeRequest(repo: RepositoryConfig, input: MergeRequestInput) {
      const token = env[gitlabGitAuth.tokenEnvName];
      if (!token) {
        throw new GitConfigError(`Missing ${gitlabGitAuth.tokenEnvName} for GitLab merge request creation.`);
      }

      const parsed = parseGitLabRepo(repo.repoUrl);
      const response = await fetchImpl(`${parsed.apiBaseUrl}/projects/${encodeURIComponent(parsed.projectPath)}/merge_requests`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "private-token": token,
        },
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          source_branch: input.sourceBranch,
          target_branch: input.targetBranch,
          remove_source_branch: true,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { web_url?: string; message?: string };
      if (!response.ok || !payload.web_url) {
        throw new Error(redactGitUrl(`GitLab merge request creation failed: ${payload.message ?? response.statusText}`));
      }

      return { url: payload.web_url };
    },
  };
}
