import type { GitAuthConfig } from "./types";

export const gitlabGitAuth: GitAuthConfig = {
  provider: "gitlab",
  tokenEnvName: "COPISAURUS_GITLAB_TOKEN",
  username: "oauth2",
};
