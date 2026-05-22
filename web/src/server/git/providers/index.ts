import type { GitProvider } from "@/server/git";
import { githubGitAuth } from "./github";
import { gitlabGitAuth } from "./gitlab";
import type { GitAuthConfig } from "./types";

const providers: Record<GitProvider, GitAuthConfig> = {
  github: githubGitAuth,
  gitlab: gitlabGitAuth,
};

export function getGitAuthConfig(provider: GitProvider): GitAuthConfig {
  return providers[provider];
}

export type { GitAuthConfig };
