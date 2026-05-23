import type { RepositoryConfig } from "@/server/config";
import type { GitProvider } from "@/server/git";

export type GitAuthConfig = {
  provider: GitProvider;
  tokenEnvName: string;
  username: string;
};

export type MergeRequestInput = {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
};

export type MergeRequestResult = {
  url: string;
};

export type GitHostingProvider = {
  getCommitUrl(repo: RepositoryConfig, commitSha: string): string;
  getBranchUrl(repo: RepositoryConfig, branch: string): string;
  createMergeRequest(repo: RepositoryConfig, input: MergeRequestInput): Promise<MergeRequestResult>;
};

export type ProviderFetch = typeof fetch;
