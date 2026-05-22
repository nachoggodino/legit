import type { GitProvider } from "@/server/git";

export type GitAuthConfig = {
  provider: GitProvider;
  tokenEnvName: string;
  username: string;
};
