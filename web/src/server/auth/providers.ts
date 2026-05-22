import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import GitLab from "next-auth/providers/gitlab";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

function hasEnv(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]));
}

const providerRequirements = [
  {
    id: "microsoft-entra-id",
    name: "Microsoft Entra ID",
    env: ["AUTH_MICROSOFT_ENTRA_ID_ID", "AUTH_MICROSOFT_ENTRA_ID_SECRET", "AUTH_MICROSOFT_ENTRA_ID_ISSUER"],
  },
  { id: "github", name: "GitHub", env: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] },
  { id: "gitlab", name: "GitLab", env: ["AUTH_GITLAB_ID", "AUTH_GITLAB_SECRET"] },
  { id: "oidc", name: "OIDC", env: ["AUTH_OIDC_ID", "AUTH_OIDC_SECRET", "AUTH_OIDC_ISSUER"] },
] as const;

export function buildAuthProviderStatuses() {
  return providerRequirements.map((provider) => {
    const missingEnv = provider.env.filter((name) => !process.env[name]);

    return {
      id: provider.id,
      name: provider.name,
      configured: missingEnv.length === 0,
      missingEnv,
    };
  });
}

export function buildAuthProviders(): Provider[] {
  const providers: Provider[] = [];

  if (hasEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "AUTH_MICROSOFT_ENTRA_ID_SECRET", "AUTH_MICROSOFT_ENTRA_ID_ISSUER")) {
    providers.push(
      MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      }),
    );
  }

  if (hasEnv("AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET")) {
    providers.push(GitHub);
  }

  if (hasEnv("AUTH_GITLAB_ID", "AUTH_GITLAB_SECRET")) {
    providers.push(
      GitLab({
        clientId: process.env.AUTH_GITLAB_ID,
        clientSecret: process.env.AUTH_GITLAB_SECRET,
        issuer: process.env.AUTH_GITLAB_ISSUER,
      }),
    );
  }

  if (hasEnv("AUTH_OIDC_ID", "AUTH_OIDC_SECRET", "AUTH_OIDC_ISSUER")) {
    providers.push({
      id: "oidc",
      name: process.env.AUTH_OIDC_NAME ?? "OIDC",
      type: "oidc",
      issuer: process.env.AUTH_OIDC_ISSUER,
      clientId: process.env.AUTH_OIDC_ID,
      clientSecret: process.env.AUTH_OIDC_SECRET,
    });
  }

  return providers;
}
