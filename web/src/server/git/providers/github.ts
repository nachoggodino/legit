import type { GitAuthConfig } from "./types";

export const githubGitAuth: GitAuthConfig = {
  provider: "github",
  tokenEnvName: "COPISAURUS_GITHUB_TOKEN",
  username: "x-access-token",
};
