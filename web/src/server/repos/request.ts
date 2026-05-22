import { getCurrentUser } from "@/server/auth";
import { loadConfig } from "@/server/config";

export async function resolveRepoRequest(repoSlug: string) {
  const config = loadConfig();
  const repo = config.repos.find((candidate) => candidate.slug === repoSlug);
  const user = await getCurrentUser();

  return { config, repo, user };
}
