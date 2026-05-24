import { afterEach, describe, expect, it } from "vitest";
import GitHub from "next-auth/providers/github";
import { buildAuthProviderStatuses, buildAuthProviders } from "@/server/auth/providers";

describe("auth providers", () => {
  const originalGithubId = process.env.AUTH_GITHUB_ID;
  const originalGithubSecret = process.env.AUTH_GITHUB_SECRET;

  afterEach(() => {
    if (originalGithubId === undefined) {
      delete process.env.AUTH_GITHUB_ID;
    } else {
      process.env.AUTH_GITHUB_ID = originalGithubId;
    }

    if (originalGithubSecret === undefined) {
      delete process.env.AUTH_GITHUB_SECRET;
    } else {
      process.env.AUTH_GITHUB_SECRET = originalGithubSecret;
    }
  });

  it("does not register GitHub when placeholder OAuth values are present", () => {
    process.env.AUTH_GITHUB_ID = "replace-with-github-oauth-client-id";
    process.env.AUTH_GITHUB_SECRET = "replace-with-github-oauth-client-secret";

    expect(buildAuthProviders()).not.toContain(GitHub);

    const githubStatus = buildAuthProviderStatuses().find((provider) => provider.id === "github");
    expect(githubStatus).toMatchObject({
      configured: false,
      missingEnv: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"],
    });
  });

  it("registers GitHub when real OAuth values are present", () => {
    process.env.AUTH_GITHUB_ID = "github-client-id";
    process.env.AUTH_GITHUB_SECRET = "github-client-secret";

    expect(buildAuthProviders()).toContain(GitHub);

    const githubStatus = buildAuthProviderStatuses().find((provider) => provider.id === "github");
    expect(githubStatus).toMatchObject({
      configured: true,
      missingEnv: [],
    });
  });
});
