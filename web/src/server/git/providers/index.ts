import type { GitProvider } from "@/server/git";
import { createGitHubProvider, githubGitAuth } from "./github";
import { createGitLabProvider, gitlabGitAuth } from "./gitlab";
import type {
  GitAuthConfig,
  GitHostingProvider,
  MergeRequestInput,
  MergeRequestResult,
  ProviderFetch,
} from "./types";

const providers: Record<GitProvider, GitAuthConfig> = {
  github: githubGitAuth,
  gitlab: gitlabGitAuth,
};

export function getGitAuthConfig(provider: GitProvider): GitAuthConfig {
  return providers[provider];
}

export function createGitHostingProvider(
  provider: GitProvider,
  options: { fetch?: ProviderFetch; env?: NodeJS.ProcessEnv } = {},
): GitHostingProvider {
  return provider === "github" ? createGitHubProvider(options) : createGitLabProvider(options);
}

export type { GitAuthConfig, GitHostingProvider, MergeRequestInput, MergeRequestResult, ProviderFetch };
