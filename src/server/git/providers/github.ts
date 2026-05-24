import type { RepositoryConfig } from "@/server/config";
import { GitConfigError, redactGitUrl } from "@/server/git";
import type { GitAuthConfig, GitHostingProvider, MergeRequestInput, ProviderFetch } from "./types";

export const githubGitAuth: GitAuthConfig = {
  provider: "github",
  tokenEnvName: "LEGIT_GITHUB_TOKEN",
  username: "x-access-token",
};

function parseGitHubRepo(repoUrl: string): { owner: string; repo: string; baseUrl: string } {
  const url = new URL(repoUrl);
  const [owner, rawRepo] = url.pathname.replace(/^\/+/, "").split("/");
  if (!owner || !rawRepo) {
    throw new GitConfigError("GitHub repository URL must include owner and repository name.");
  }

  return {
    owner,
    repo: rawRepo.replace(/\.git$/, ""),
    baseUrl: `${url.protocol}//${url.host}`,
  };
}

export function createGitHubProvider(options: { fetch?: ProviderFetch; env?: NodeJS.ProcessEnv } = {}): GitHostingProvider {
  const fetchImpl = options.fetch ?? fetch;
  const env = options.env ?? process.env;

  return {
    getCommitUrl(repo: RepositoryConfig, commitSha: string) {
      const parsed = parseGitHubRepo(repo.repoUrl);
      return `${parsed.baseUrl}/${parsed.owner}/${parsed.repo}/commit/${encodeURIComponent(commitSha)}`;
    },
    getBranchUrl(repo: RepositoryConfig, branch: string) {
      const parsed = parseGitHubRepo(repo.repoUrl);
      return `${parsed.baseUrl}/${parsed.owner}/${parsed.repo}/tree/${encodeURIComponent(branch)}`;
    },
    async createMergeRequest(repo: RepositoryConfig, input: MergeRequestInput) {
      const token = env[githubGitAuth.tokenEnvName];
      if (!token) {
        throw new GitConfigError(`Missing ${githubGitAuth.tokenEnvName} for GitHub pull request creation.`);
      }

      const parsed = parseGitHubRepo(repo.repoUrl);
      const response = await fetchImpl(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls`, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "legit",
        },
        body: JSON.stringify({
          title: input.title,
          body: input.description,
          head: input.sourceBranch,
          base: input.targetBranch,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { html_url?: string; message?: string };
      if (!response.ok || !payload.html_url) {
        throw new Error(redactGitUrl(`GitHub pull request creation failed: ${payload.message ?? response.statusText}`));
      }

      return { url: payload.html_url };
    },
  };
}
